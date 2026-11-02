import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { Cart } from '../models/Cart.js';
import { Address } from '../models/Address.js';
import { Coupon } from '../models/Coupon.js';
import { MenuItem } from '../models/MenuItem.js';
import { Order } from '../models/Order.js';
import { Restaurant } from '../models/Restaurant.js';
import { User } from '../models/User.js';
import { calculateCart, lineKey, validateSelections, paise, type CartLike, type Selection } from '../services/pricing.js';
import { assignPartnerSchema, cancelOrderSchema, placeOrderSchema, reorderSchema, statusSchema } from '../validators/commerce.js';
import { ApiError } from '../utils/errors.js';
import { publishOrderEvent } from '../services/realtime.js';
import { stopCancelledDelivery } from '../services/delivery-cancellation.js';

const id=(value:unknown)=>typeof value==='string' && mongoose.isValidObjectId(value)?value:null;
const orderData=(row:unknown)=>({...row as object,id:String((row as {_id:unknown})._id)});
export const placeOrder:RequestHandler=async (req,res)=>{
  const input=placeOrderSchema.parse(req.body);const userId=res.locals.user._id as mongoose.Types.ObjectId;
  const existing=await Order.findOne({userId,idempotencyKey:input.idempotencyKey}).lean();
  if (existing) {res.status(200).json({data:orderData(existing)});return;}
  const session=await mongoose.startSession();let createdId:mongoose.Types.ObjectId|undefined;
  try {
    await session.withTransaction(async()=>{
      const repeated=await Order.findOne({userId,idempotencyKey:input.idempotencyKey}).session(session);
      if (repeated) {createdId=repeated._id;return;}
      const cart=await Cart.findOne({userId}).session(session);
      if (!cart || !cart.items.length) throw new ApiError(400,'CART_EMPTY','Your cart is empty');
      const address=await Address.findOne({_id:input.addressId,userId}).session(session);
      if (!address) throw new ApiError(404,'ADDRESS_NOT_FOUND','Delivery address not found');
      const quote=await calculateCart(cart as CartLike,userId,input.code,session);
      if (!quote.restaurant.isOpen) throw new ApiError(409,'RESTAURANT_CLOSED','Restaurant is closed');
      if (!quote.restaurant.codEnabled) throw new ApiError(409,'COD_UNAVAILABLE','Cash on Delivery is not available');
      if (input.code) {
        const updated=await Coupon.updateOne({code:input.code,isActive:true,$expr:{$or:[{$eq:['$usageLimit',0]},{$lt:['$usageCount','$usageLimit']}]}},{$inc:{usageCount:1}},{session});
        if (updated.modifiedCount!==1) throw new ApiError(409,'COUPON_LIMIT','Coupon usage limit reached');
      }
      const now=new Date();
      const [order]=await Order.create([{orderNumber:`FG-${now.toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,userId,restaurantId:cart.restaurantId,restaurantSnapshot:{name:quote.restaurant.name,image:quote.restaurant.image,averageDeliveryTime:quote.restaurant.averageDeliveryTime},items:quote.items.map(({key,...item})=>{void key;return item;}),deliveryAddressSnapshot:address.toObject(),deliveryInstructions:input.deliveryInstructions,pricingBreakdown:quote.pricing,couponSnapshot:quote.coupon,paymentMethod:'COD',paymentStatus:'PENDING',orderStatus:'PLACED',statusHistory:[{status:'PLACED',at:now,by:userId}],placedAt:now,idempotencyKey:input.idempotencyKey}],{session});
      const removed=await Cart.deleteOne({_id:cart._id,revision:cart.revision},{session});
      if (removed.deletedCount!==1) throw new ApiError(409,'CART_CHANGED','Cart changed during checkout. Please review it and try again');
      createdId=order!._id;
    });
  } catch (error) {
    if (typeof error==='object' && error!==null && 'code' in error && error.code===11000) {
      const repeated=await Order.findOne({userId,idempotencyKey:input.idempotencyKey}).lean();
      if (repeated) {res.json({data:orderData(repeated)});return;}
    }
    throw error;
  } finally {await session.endSession();}
  const order=await Order.findById(createdId).lean();
  if (!order) throw new ApiError(500,'ORDER_MISSING','Order was saved but could not be loaded');
  publishOrderEvent(order._id,'order:placed',{orderStatus:order.orderStatus});
  res.status(201).json({data:orderData(order)});
};
export const listOrders:RequestHandler=async (req,res)=>{
  const page=Math.max(1,Math.min(10000,Number(req.query.page)||1));const limit=Math.max(1,Math.min(20,Number(req.query.limit)||10));
  const statuses=['PLACED','CONFIRMED','PREPARING','READY_FOR_PICKUP','PICKED_UP','ON_THE_WAY','DELIVERED','CANCELLED'] as const;
  const status=typeof req.query.status==='string' && statuses.some(value=>value===req.query.status)?req.query.status as typeof statuses[number]:undefined;
  const filter={userId:res.locals.user._id,checkoutState:{$nin:['PENDING_PAYMENT','FAILED'] as const},...(status?{orderStatus:status}:{})};
  const [rows,total]=await Promise.all([Order.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit).lean(),Order.countDocuments(filter)]);
  res.json({data:rows.map(orderData),meta:{page,limit,total,pages:Math.ceil(total/limit)}});
};
export const getOrder:RequestHandler=async (req,res)=>{
  const orderId=id(req.params.id);if (!orderId) throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  const order=await Order.findOne({_id:orderId,userId:res.locals.user._id}).lean();
  if (!order) throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  res.json({data:orderData(order)});
};
export const cancelOrder:RequestHandler=async (req,res)=>{
  const orderId=id(req.params.id);if (!orderId) throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  const {reason}=cancelOrderSchema.parse(req.body);const user=res.locals.user;
  const order=await Order.findById(orderId);
  if (!order) throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  if (String(order.userId)!==String(user._id) && user.role!=='ADMIN') throw new ApiError(403,'FORBIDDEN','Access denied');
  if (order.orderStatus==='CANCELLED') {await stopCancelledDelivery(order._id);res.json({data:orderData(order.toObject())});return;}
  if (!['PLACED','CONFIRMED'].includes(order.orderStatus) || Date.now()-order.placedAt.getTime()>10*60_000) throw new ApiError(409,'CANCELLATION_CLOSED','This order can no longer be cancelled');
  const now=new Date();
  const updated=await Order.findOneAndUpdate({_id:orderId,orderStatus:order.orderStatus},{$set:{orderStatus:'CANCELLED',cancelledAt:now,cancellationReason:reason},$push:{statusHistory:{status:'CANCELLED',at:now,by:user._id}}},{returnDocument:'after'});
  if (!updated) throw new ApiError(409,'STATUS_CHANGED','Order status changed. Refresh and try again');
  await stopCancelledDelivery(orderId);
  publishOrderEvent(orderId,'order:cancelled',{orderStatus:'CANCELLED',at:now.toISOString()});
  res.json({data:orderData(updated.toObject())});
};
const nextStatus:Record<string,string[]>={PLACED:['CONFIRMED'],CONFIRMED:['PREPARING'],PREPARING:['READY_FOR_PICKUP'],READY_FOR_PICKUP:['PICKED_UP'],PICKED_UP:['ON_THE_WAY'],ON_THE_WAY:['DELIVERED']};
export const assignDeliveryPartner:RequestHandler=async(req,res)=>{
  const orderId=id(req.params.id);if(!orderId)throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  const {partnerId}=assignPartnerSchema.parse(req.body);
  const partner=await User.findOne({_id:partnerId,role:'DELIVERY_PARTNER',isActive:true}).select('_id');
  if(!partner)throw new ApiError(404,'PARTNER_NOT_FOUND','Active delivery partner not found');
  const now=new Date();
  const order=await Order.findOneAndUpdate({_id:orderId,checkoutState:{$ne:'PENDING_PAYMENT'},orderStatus:{$in:['CONFIRMED','PREPARING','READY_FOR_PICKUP']}},{$set:{assignedDeliveryPartnerId:partner._id},$push:{assignmentHistory:{partnerId:partner._id,at:now,by:res.locals.user._id}}},{returnDocument:'after'});
  if(!order)throw new ApiError(409,'ASSIGNMENT_CLOSED','Order is not eligible for delivery assignment');
  res.json({data:orderData(order.toObject())});
};
export const updateOrderStatus:RequestHandler=async (req,res)=>{
  const orderId=id(req.params.id);if (!orderId) throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  const input=statusSchema.parse(req.body);const user=res.locals.user;
  const order=await Order.findById(orderId);
  if (!order) throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  if(order.checkoutState==='PENDING_PAYMENT'||order.checkoutState==='FAILED')throw new ApiError(409,'PAYMENT_PENDING','Order payment is not confirmed');
  const owner=user.role==='RESTAURANT_OWNER' && String((await Restaurant.findById(order.restaurantId).select('ownerId'))?.ownerId)===String(user._id);
  const partner=user.role==='DELIVERY_PARTNER' && String(order.assignedDeliveryPartnerId)===String(user._id);
  if (user.role!=='ADMIN' && !owner && !partner) throw new ApiError(403,'FORBIDDEN','Access denied');
  if (input.status==='CANCELLED') throw new ApiError(400,'INVALID_TRANSITION','Use the cancellation endpoint');
  if (input.status==='DELIVERED') throw new ApiError(400,'DELIVERY_VERIFICATION_REQUIRED','Complete delivery through the verified delivery workflow');
  if (!nextStatus[order.orderStatus]?.includes(input.status)) throw new ApiError(409,'INVALID_TRANSITION','Invalid order status transition');
  if (owner && !['CONFIRMED','PREPARING','READY_FOR_PICKUP'].includes(input.status)) throw new ApiError(403,'FORBIDDEN','Restaurant owner cannot make this update');
  if (partner && !['PICKED_UP','ON_THE_WAY','DELIVERED'].includes(input.status)) throw new ApiError(403,'FORBIDDEN','Delivery partner cannot make this update');
  const now=new Date();
  const updated=await Order.findOneAndUpdate({_id:orderId,orderStatus:order.orderStatus},{$set:{orderStatus:input.status},$push:{statusHistory:{status:input.status,at:now,by:user._id}}},{returnDocument:'after'});
  if (!updated) throw new ApiError(409,'STATUS_CHANGED','Order status changed. Refresh and try again');
  const eventByStatus:Record<string,string>={CONFIRMED:'order:confirmed',PREPARING:'order:preparing',READY_FOR_PICKUP:'order:ready',PICKED_UP:'delivery:picked_up',ON_THE_WAY:'delivery:on_the_way',DELIVERED:'order:delivered'};
  publishOrderEvent(orderId,eventByStatus[input.status]||'order:updated',{orderStatus:input.status,at:now.toISOString()});
  res.json({data:orderData(updated.toObject())});
};
export const reorder:RequestHandler=async (req,res)=>{
  const orderId=id(req.params.id);if (!orderId) throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  const {replaceExisting}=reorderSchema.parse(req.body);const userId=res.locals.user._id as mongoose.Types.ObjectId;
  const order=await Order.findOne({_id:orderId,userId});if (!order) throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  const restaurant=await Restaurant.findById(order.restaurantId);if (!restaurant || !restaurant.isApproved) throw new ApiError(409,'RESTAURANT_UNAVAILABLE','Restaurant is unavailable');
  const docs=await MenuItem.find({_id:{$in:order.items.map(item=>item.menuItemId)}});
  const byId=new Map(docs.map(item=>[String(item._id),item]));
  const unavailable:string[]=[];const priceChanges:Array<{name:string;wasPaise:number;nowPaise:number}>=[];
  const eligible:Array<{key:string;menuItemId:mongoose.Types.ObjectId;quantity:number;selections:Selection[];specialInstructions:string}>=[];
  for (const old of order.items) {
    const current=byId.get(String(old.menuItemId));
    if (!current || !current.isAvailable || String(current.restaurantId)!==String(order.restaurantId)) {unavailable.push(old.name || 'Unavailable item');continue;}
    const selections=(old.selections || []).map(s=>({group:s.group || '',options:s.options.map(option=>option.name || '')}));
    try {validateSelections(current.customizationOptions,selections);} catch {unavailable.push(old.name || 'Unavailable customization');continue;}
    if (paise(current.price)!==old.unitPricePaise) priceChanges.push({name:current.name,wasPaise:old.unitPricePaise || 0,nowPaise:paise(current.price)});
    eligible.push({key:lineKey(String(current._id),selections),menuItemId:current._id,quantity:Math.min(old.quantity || 1,20),selections,specialInstructions:old.specialInstructions || ''});
  }
  if (!eligible.length) throw new ApiError(409,'REORDER_UNAVAILABLE','No previous items are currently available');
  let cart=await Cart.findOne({userId});
  if (cart?.items.length && String(cart.restaurantId)!==String(order.restaurantId) && !replaceExisting) throw new ApiError(409,'CART_RESTAURANT_CONFLICT','Confirm before replacing the current cart');
  if (!cart) cart=await Cart.create({userId,restaurantId:order.restaurantId,items:[]});
  if (replaceExisting) {cart.restaurantId=order.restaurantId;cart.items.splice(0);}
  for (const item of eligible) {
    const found=cart.items.find(line=>line.key===item.key);
    if (found) found.quantity=Math.min(20,found.quantity+item.quantity);
    else cart.items.push(item);
  }
  await cart.save();
  res.json({data:{cart:await calculateCart(cart as CartLike,userId),unavailable,priceChanges}});
};
