import type { RequestHandler } from 'express';
import crypto from 'node:crypto';
import { AuditLog } from '../models/AuditLog.js';
import { z } from 'zod';
import mongoose from 'mongoose';
import { DeliveryAssignment } from '../models/DeliveryAssignment.js';
import { DeliveryPartner } from '../models/DeliveryPartner.js';
import { Order } from '../models/Order.js';
import { Restaurant } from '../models/Restaurant.js';
import { User } from '../models/User.js';
import { publishOrderEvent } from '../services/realtime.js';
import { partnerSchema,assignSchema,locationSchema } from '../validators/delivery.js';
import { ApiError } from '../utils/errors.js';
import type { Env } from '../config/env.js';

const objectId=(value:unknown)=>typeof value==='string'&&mongoose.isValidObjectId(value)?value:null;
const serialize=(row:unknown)=>({...row as object,id:String((row as {_id:unknown})._id)});
const active=['OFFERED','ACCEPTED','PICKED_UP','ON_THE_WAY'] as const;
export const requestCompletionCode:RequestHandler=async(req,res)=>{
  const order=await Order.findOne({_id:objectId(req.params.orderId),userId:res.locals.user._id,orderStatus:'ON_THE_WAY'});
  if(!order)throw new ApiError(404,'NOT_FOUND','Active delivery not found');
  const code=String(crypto.randomInt(100000,1000000));
  const row=await DeliveryAssignment.findOneAndUpdate({orderId:order._id,assignmentStatus:'ON_THE_WAY'},{$set:{completionCodeHash:crypto.createHash('sha256').update(code).digest('hex'),completionCodeExpiresAt:new Date(Date.now()+10*60_000),completionAttempts:0}},{returnDocument:'after'});
  if(!row)throw new ApiError(409,'NOT_ACTIVE','Delivery is not active');
  res.json({data:{code,expiresAt:row.completionCodeExpiresAt}});
};
const partnerActive=['ACCEPTED','PICKED_UP','ON_THE_WAY'] as const;
let trackingConfig={minInterval:5000,minDistance:30,stationaryInterval:30000};
export function configureTracking(env:Env){trackingConfig={minInterval:env.TRACKING_MIN_INTERVAL_MS,minDistance:env.TRACKING_MIN_DISTANCE_METERS,stationaryInterval:env.TRACKING_STATIONARY_INTERVAL_MS};}

function distanceMeters(a:[number,number],b:[number,number]){
  const rad=Math.PI/180,dLat=(b[1]-a[1])*rad,dLng=(b[0]-a[0])*rad;
  const h=Math.sin(dLat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dLng/2)**2;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
}

async function assignmentForPartner(id:string,userId:mongoose.Types.ObjectId){
  const row=await DeliveryAssignment.findOne({_id:id,deliveryPartnerId:userId});
  if(!row)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');
  return row;
}

export const createPartner:RequestHandler=async(req,res)=>{
  const input=partnerSchema.parse(req.body);
  const user=await User.findOne({_id:input.userId,isActive:true});
  if(!user)throw new ApiError(404,'USER_NOT_FOUND','User not found');
  if(user.role==='ADMIN'||await Restaurant.exists({ownerId:user._id}))throw new ApiError(409,'ROLE_PROTECTED','Administrators and current restaurant owners cannot be converted into delivery partners');
  if(await DeliveryPartner.exists({userId:user._id,activeDeliveryId:{$ne:null}}))throw new ApiError(409,'PARTNER_BUSY','Finish the active delivery before changing verification');
  const session=await mongoose.startSession();let profile;
  try{await session.withTransaction(async()=>{
    profile=await DeliveryPartner.findOneAndUpdate({userId:user._id},{$set:{phone:input.phone,vehicleType:input.vehicleType,vehicleNumber:input.vehicleNumber,isVerified:input.isVerified,isAvailable:input.isVerified}},{upsert:true,returnDocument:'after',runValidators:true,session});
    await User.updateOne({_id:user._id},{$set:{role:'DELIVERY_PARTNER'}},{session});
  });}finally{await session.endSession();}
  await AuditLog.create({actorId:res.locals.user._id,action:'partner.provision',resource:'DeliveryPartner',resourceId:String(profile!._id),changes:{userId:input.userId,isVerified:input.isVerified}});
  res.status(201).json({data:serialize(profile!.toObject())});
};

export const assign:RequestHandler=async(req,res)=>{
  const input=assignSchema.parse(req.body);
  const order=await Order.findById(input.orderId);
  if(!order||order.checkoutState==='PENDING_PAYMENT'||order.checkoutState==='FAILED'||!['CONFIRMED','PREPARING','READY_FOR_PICKUP'].includes(order.orderStatus))throw new ApiError(409,'ORDER_NOT_ELIGIBLE','Order is not eligible for delivery assignment');
  const partner=await DeliveryPartner.findOne({userId:input.partnerId,isVerified:true,isAvailable:true,activeDeliveryId:null});
  if(!partner)throw new ApiError(409,'PARTNER_NOT_ELIGIBLE','Partner is not verified or available');
  const restaurant=await Restaurant.findById(order.restaurantId).select('location');
  const address=order.deliveryAddressSnapshot as {latitude?:number;longitude?:number};
  const pickup=restaurant?.location?.coordinates?.length===2?restaurant.location:undefined;
  const delivery=Number.isFinite(address.latitude)&&Number.isFinite(address.longitude)?{type:'Point' as const,coordinates:[address.longitude!,address.latitude!]}:undefined;
  let row=await DeliveryAssignment.findOne({orderId:order._id});
  if(active.some(status=>status===row?.assignmentStatus))throw new ApiError(409,'ALREADY_ASSIGNED','Order already has an active assignment');
  const now=new Date();
  if(row)row=await DeliveryAssignment.findOneAndUpdate({_id:row._id,assignmentStatus:{$in:['REJECTED','CANCELLED']}},{$set:{deliveryPartnerId:partner.userId,assignmentStatus:'OFFERED',assignedAt:now,pickupLocation:pickup,deliveryLocation:delivery,trackingEnabled:false},$push:{history:{status:'OFFERED',at:now,by:res.locals.user._id}}},{returnDocument:'after'});
  else try{row=await DeliveryAssignment.create({orderId:order._id,deliveryPartnerId:partner.userId,restaurantId:order.restaurantId,pickupLocation:pickup,deliveryLocation:delivery,assignmentStatus:'OFFERED',assignedAt:now,history:[{status:'OFFERED',at:now,by:res.locals.user._id}]});}catch(error){if(typeof error==='object'&&error!==null&&'code'in error&&error.code===11000)throw new ApiError(409,'ALREADY_ASSIGNED','Order already has an assignment');throw error;}
  if(!row)throw new ApiError(409,'ALREADY_ASSIGNED','Order assignment changed');
  await AuditLog.create({actorId:res.locals.user._id,action:'delivery.assign',resource:'DeliveryAssignment',resourceId:String(row._id),changes:{partnerId:input.partnerId,orderId:input.orderId}});
  publishOrderEvent(order._id,'delivery:assigned',{assignmentId:String(row._id),at:now.toISOString()});
  res.status(201).json({data:serialize(row.toObject())});
};

export const mine:RequestHandler=async(req,res)=>{
  const rows=await DeliveryAssignment.find({deliveryPartnerId:res.locals.user._id,assignmentStatus:{$in:active}}).sort({assignedAt:-1}).limit(50).lean();
  const [orders,restaurants]=await Promise.all([Order.find({_id:{$in:rows.map(row=>row.orderId)}}).select('orderNumber items deliveryAddressSnapshot deliveryInstructions orderStatus').lean(),Restaurant.find({_id:{$in:rows.map(row=>row.restaurantId)}}).select('name address city area').lean()]);
  const byOrder=new Map(orders.map(order=>[String(order._id),order])),byRestaurant=new Map(restaurants.map(restaurant=>[String(restaurant._id),restaurant]));
  const data=rows.map(row=>({...serialize(row),order:byOrder.get(String(row.orderId))||null,restaurant:byRestaurant.get(String(row.restaurantId))||null}));
  res.json({data});
};

export const getDelivery:RequestHandler=async(req,res)=>{
  const id=objectId(req.params.id);if(!id)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');
  const row=await DeliveryAssignment.findById(id).lean();
  if(!row)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');
  const order=await Order.findById(row.orderId).select('userId restaurantId orderStatus');
  const user=res.locals.user;
  const owner=String(order?.userId)===String(user._id),partner=String(row.deliveryPartnerId)===String(user._id);
  const restaurantOwner=user.role==='RESTAURANT_OWNER'&&String((await Restaurant.findById(order?.restaurantId).select('ownerId'))?.ownerId)===String(user._id);
  if(!owner&&!partner&&!restaurantOwner&&user.role!=='ADMIN')throw new ApiError(403,'FORBIDDEN','Access denied');
  const profile=await DeliveryPartner.findOne({userId:row.deliveryPartnerId}).select('phone currentLocation lastLocationUpdatedAt trackingEnabled').lean();
  const partnerUser=await User.findById(row.deliveryPartnerId).select('name').lean();
  res.json({data:{...serialize(row),partner:{name:partnerUser?.name||'Delivery partner',phone:profile?.phone||null},location:order&&!['DELIVERED','CANCELLED'].includes(order.orderStatus)&&row.trackingEnabled&&partnerActive.some(status=>status===row.assignmentStatus)&&profile?.trackingEnabled&&profile.lastLocationUpdatedAt&&Date.now()-profile.lastLocationUpdatedAt.getTime()<120000?{coordinates:profile.currentLocation?.coordinates,lastUpdatedAt:profile.lastLocationUpdatedAt}:null}});
};

export const byOrder:RequestHandler=async(req,res)=>{
  const orderId=objectId(req.params.orderId);if(!orderId)throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  const order=await Order.findOne({_id:orderId,userId:res.locals.user._id});
  if(!order)throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
  const assignment=await DeliveryAssignment.findOne({orderId,assignmentStatus:{$ne:'REJECTED'}});
  if(!assignment){res.json({data:null});return;}
  req.params.id=String(assignment._id);await getDelivery(req,res,()=>{});
};

export const accept:RequestHandler=async(req,res)=>{
  const id=objectId(req.params.id);if(!id)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');
  const userId=res.locals.user._id as mongoose.Types.ObjectId;
  const session=await mongoose.startSession();let row;
  try{await session.withTransaction(async()=>{
    const partner=await DeliveryPartner.findOneAndUpdate({userId,isVerified:true,isAvailable:true,activeDeliveryId:null},{$set:{activeDeliveryId:id,isAvailable:false}},{returnDocument:'after',session});
    if(!partner)throw new ApiError(409,'PARTNER_BUSY','Partner is unavailable or has another delivery');
    const now=new Date();
    row=await DeliveryAssignment.findOneAndUpdate({_id:id,deliveryPartnerId:userId,assignmentStatus:'OFFERED'},{$set:{assignmentStatus:'ACCEPTED',acceptedAt:now},$push:{history:{status:'ACCEPTED',at:now,by:userId}}},{returnDocument:'after',session});
    if(!row)throw new ApiError(409,'ASSIGNMENT_CHANGED','Assignment is not available');
    await Order.updateOne({_id:row.orderId},{$set:{assignedDeliveryPartnerId:userId}},{session});
  });}finally{await session.endSession();}
  publishOrderEvent(row!.orderId,'delivery:assigned',{assignmentId:String(row!._id),accepted:true});
  res.json({data:serialize(row!.toObject())});
};

export const reject:RequestHandler=async(req,res)=>{
  const id=objectId(req.params.id);if(!id)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');
  const now=new Date();
  const row=await DeliveryAssignment.findOneAndUpdate({_id:id,deliveryPartnerId:res.locals.user._id,assignmentStatus:'OFFERED'},{$set:{assignmentStatus:'REJECTED'},$push:{history:{status:'REJECTED',at:now,by:res.locals.user._id}}},{returnDocument:'after'});
  if(!row)throw new ApiError(409,'ASSIGNMENT_CHANGED','Assignment cannot be rejected');
  publishOrderEvent(row.orderId,'delivery:assigned',{assignmentId:String(row._id),rejected:true});
  res.json({data:serialize(row.toObject())});
};

async function transition(id:string,userId:mongoose.Types.ObjectId,from:'ACCEPTED'|'PICKED_UP'|'ON_THE_WAY',to:'PICKED_UP'|'ON_THE_WAY'|'DELIVERED',completionHash?:string){
  const session=await mongoose.startSession();let row;
  try{await session.withTransaction(async()=>{
    const now=new Date();
    const assignment=await DeliveryAssignment.findOne({_id:id,deliveryPartnerId:userId,assignmentStatus:from}).session(session);
    if(!assignment)throw new ApiError(409,'INVALID_TRANSITION','Delivery state changed');
    if(to==='DELIVERED'){
      const verified=await DeliveryAssignment.updateOne({_id:id,deliveryPartnerId:userId,assignmentStatus:'ON_THE_WAY',completionCodeHash:completionHash,completionCodeExpiresAt:{$gt:now},completionAttempts:{$lt:5}},{$set:{completionVerifiedAt:now,completionCodeHash:null}},{session});
      if(verified.modifiedCount!==1)throw new ApiError(403,'DELIVERY_CODE_INVALID','Request a new delivery code from the customer');
    }
    const requiredOrder=from==='ACCEPTED'?'READY_FOR_PICKUP':from;
    const order=await Order.findOneAndUpdate({_id:assignment.orderId,orderStatus:requiredOrder,assignedDeliveryPartnerId:userId,checkoutState:{$ne:'PENDING_PAYMENT'}},{$set:{orderStatus:to,...(to==='DELIVERED'?{deliveredAt:now}:{})},$push:{statusHistory:{status:to,at:now,by:userId}}},{returnDocument:'after',session});
    if(!order)throw new ApiError(409,'INVALID_TRANSITION','Order is not ready for this step');
    row=await DeliveryAssignment.findOneAndUpdate({_id:id,assignmentStatus:from},{$set:{assignmentStatus:to,...(to==='PICKED_UP'?{pickedUpAt:now}:{}),...(to==='DELIVERED'?{deliveredAt:now,trackingEnabled:false}:{})},$push:{history:{status:to,at:now,by:userId}}},{returnDocument:'after',session});
    if(to==='DELIVERED')await DeliveryPartner.updateOne({userId,activeDeliveryId:id},{$set:{activeDeliveryId:null,isAvailable:true,trackingEnabled:false,lastLocationUpdatedAt:null},$unset:{currentLocation:1}},{session});
  });}finally{await session.endSession();}
  const event=to==='PICKED_UP'?'delivery:picked_up':to==='ON_THE_WAY'?'delivery:on_the_way':'order:delivered';
  publishOrderEvent(row!.orderId,event,{orderStatus:to,at:new Date().toISOString()});
  return row!;
}

export const pickup:RequestHandler=async(req,res)=>{const id=objectId(req.params.id);if(!id)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');res.json({data:serialize((await transition(id,res.locals.user._id,'ACCEPTED','PICKED_UP')).toObject())});};
export const startDelivery:RequestHandler=async(req,res)=>{const id=objectId(req.params.id);if(!id)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');res.json({data:serialize((await transition(id,res.locals.user._id,'PICKED_UP','ON_THE_WAY')).toObject())});};
export const complete:RequestHandler=async(req,res)=>{
  const id=objectId(req.params.id);if(!id)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');
  const row=await assignmentForPartner(id,res.locals.user._id);if(row.assignmentStatus!=='ON_THE_WAY')throw new ApiError(409,'INVALID_TRANSITION','Delivery is not on the way');
  const {code}=z.object({code:z.string().regex(/^\d{6}$/)}).strict().parse(req.body);
  const hash=crypto.createHash('sha256').update(code).digest('hex');
  try{res.json({data:serialize((await transition(id,res.locals.user._id,'ON_THE_WAY','DELIVERED',hash)).toObject())});}
  catch(error){if(error instanceof ApiError&&error.code==='DELIVERY_CODE_INVALID')await DeliveryAssignment.updateOne({_id:id,deliveryPartnerId:res.locals.user._id},{$inc:{completionAttempts:1}});throw error;}
};

export const startTracking:RequestHandler=async(req,res)=>{
  const id=objectId(req.params.id);if(!id)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');
  const row=await assignmentForPartner(id,res.locals.user._id);
  if(!partnerActive.some(status=>status===row.assignmentStatus))throw new ApiError(409,'TRACKING_UNAVAILABLE','Delivery is not active');
  const profile=await DeliveryPartner.updateOne({userId:res.locals.user._id,activeDeliveryId:id},{$set:{trackingEnabled:true}});
  if(profile.modifiedCount!==1)throw new ApiError(409,'PARTNER_BUSY','No active delivery to track');
  await DeliveryAssignment.updateOne({_id:id},{$set:{trackingEnabled:true}});
  res.json({data:{trackingEnabled:true}});
};
export const stopTracking:RequestHandler=async(req,res)=>{
  const id=objectId(req.params.id);if(!id)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');
  await assignmentForPartner(id,res.locals.user._id);
  await DeliveryAssignment.updateOne({_id:id},{$set:{trackingEnabled:false}});
  await DeliveryPartner.updateOne({userId:res.locals.user._id},{$set:{trackingEnabled:false,lastLocationUpdatedAt:null},$unset:{currentLocation:1}});
  publishOrderEvent((await DeliveryAssignment.findById(id))!.orderId,'delivery:location',{location:null});
  res.json({data:{trackingEnabled:false}});
};

export const updateLocation:RequestHandler=async(req,res)=>{
  const id=objectId(req.params.id);if(!id)throw new ApiError(404,'DELIVERY_NOT_FOUND','Delivery not found');
  const input=locationSchema.parse(req.body);const row=await assignmentForPartner(id,res.locals.user._id);
  if(!row.trackingEnabled||!partnerActive.some(status=>status===row.assignmentStatus))throw new ApiError(403,'TRACKING_DISABLED','Location sharing is not active');
  const profile=await DeliveryPartner.findOne({userId:res.locals.user._id,activeDeliveryId:id,trackingEnabled:true});
  if(!profile)throw new ApiError(403,'TRACKING_DISABLED','Location sharing is not active');
  const now=new Date(),next:[number,number]=[input.longitude,input.latitude];
  const elapsed=profile.lastLocationUpdatedAt?now.getTime()-profile.lastLocationUpdatedAt.getTime():Infinity;
  const moved=profile.currentLocation?.coordinates?.length===2?distanceMeters(profile.currentLocation.coordinates as [number,number],next):Infinity;
  if(elapsed<trackingConfig.minInterval||moved<trackingConfig.minDistance&&elapsed<trackingConfig.stationaryInterval){res.json({data:{saved:false,lastUpdatedAt:profile.lastLocationUpdatedAt}});return;}
  const saved=await DeliveryPartner.updateOne({_id:profile._id,trackingEnabled:true,activeDeliveryId:id},{$set:{currentLocation:{type:'Point',coordinates:next},lastLocationUpdatedAt:now}});
  if(saved.modifiedCount!==1)throw new ApiError(409,'TRACKING_DISABLED','Location sharing stopped');
  publishOrderEvent(row.orderId,'delivery:location',{location:{coordinates:next,lastUpdatedAt:now.toISOString()}});
  res.json({data:{saved:true,lastUpdatedAt:now}});
};
