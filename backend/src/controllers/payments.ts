import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { AuditLog } from '../models/AuditLog.js';
import { publishAdminNotice } from '../services/realtime.js';
import mongoose from 'mongoose';
import type { Env } from '../config/env.js';
import { Address } from '../models/Address.js';
import { Cart } from '../models/Cart.js';
import { Coupon } from '../models/Coupon.js';
import { Order } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { Refund } from '../models/Refund.js';
import { WebhookEvent } from '../models/WebhookEvent.js';
import { calculateCart, type CartLike } from '../services/pricing.js';
import { validHmac, type GatewayPayment, type GatewayRefund, type PaymentGateway } from '../services/payment-gateway.js';
import { startPaymentSchema, verifyPaymentSchema, refundSchema } from '../validators/payment.js';
import { ApiError } from '../utils/errors.js';

const objectId=(value:unknown)=>typeof value==='string'&&mongoose.isValidObjectId(value)?value:null;
const serialize=(row:unknown)=>({...row as object,id:String((row as {_id:unknown})._id)});
const positivePaise=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;

export function paymentController(env:Env,gateway:PaymentGateway|null){
  const requireGateway=()=>{if(!gateway||!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)throw new ApiError(503,'PAYMENTS_UNAVAILABLE','Online test payments are not configured');return gateway;};

  async function releaseReservation(orderId:mongoose.Types.ObjectId){
    const order=await Order.findOneAndUpdate({_id:orderId,checkoutState:'PENDING_PAYMENT'},{$set:{checkoutState:'FAILED',paymentStatus:'FAILED',couponReserved:false}},{returnDocument:'before'});
    if(order?.couponReserved&&order.couponSnapshot?.code)await Coupon.updateOne({code:order.couponSnapshot.code,usageCount:{$gt:0}},{$inc:{usageCount:-1}});
  }

  async function captured(paymentId:mongoose.Types.ObjectId,provider:GatewayPayment){
    const payment=await Payment.findById(paymentId);
    if(!payment||!payment.razorpayOrderId||provider.order_id!==payment.razorpayOrderId||Number(provider.amount)!==payment.amountPaise||provider.currency!=='INR'||provider.status!=='captured')throw new ApiError(409,'PAYMENT_MISMATCH','Provider payment does not match this order');
    if(payment.razorpayPaymentId&&payment.razorpayPaymentId!==provider.id)throw new ApiError(409,'PAYMENT_MISMATCH','Another payment is already recorded');
    const session=await mongoose.startSession();
    try{await session.withTransaction(async()=>{
      const fresh=await Payment.findOneAndUpdate({_id:paymentId,status:{$nin:['CAPTURED','REFUNDED','PARTIALLY_REFUNDED']}},{$set:{status:'CAPTURED',razorpayPaymentId:provider.id,method:provider.method||null,verifiedAt:new Date(),failureReason:null}},{returnDocument:'after',session});
      if(!fresh)return;
      const now=new Date();
      const order=await Order.findOneAndUpdate({_id:fresh.orderId,checkoutState:{$in:['PENDING_PAYMENT','FAILED']}},{$set:{checkoutState:'CONFIRMED',paymentStatus:'PAID',placedAt:now},$push:{statusHistory:{status:'PLACED',at:now,by:fresh.userId}}},{returnDocument:'after',session});
      if(order){
        if(!order.couponReserved&&order.couponSnapshot?.code)await Coupon.updateOne({code:order.couponSnapshot.code},{$inc:{usageCount:1}},{session});
        if(order.checkoutCartId)await Cart.deleteOne({_id:order.checkoutCartId,revision:order.checkoutCartRevision},{session});
      }
    });}finally{await session.endSession();}
  }

  async function reconcile(orderId:mongoose.Types.ObjectId){
    const provider=requireGateway();
    const attempts=await Payment.find({orderId,razorpayOrderId:{$exists:true},status:{$in:['PENDING','AUTHORIZED']}}).sort({createdAt:-1});
    for(const attempt of attempts){
      const rows=await provider.fetchOrderPayments(attempt.razorpayOrderId!);
      const match=rows.find(row=>row.order_id===attempt.razorpayOrderId&&Number(row.amount)===attempt.amountPaise&&row.currency==='INR'&&row.status==='captured');
      if(match){await captured(attempt._id,match);break;}
    }
  }

  const createOrder:RequestHandler=async(req,res)=>{
    const provider=requireGateway();const input=startPaymentSchema.parse(req.body);const userId=res.locals.user._id as mongoose.Types.ObjectId;
    const cart=await Cart.findOne({userId});
    if(!cart||!cart.items.length)throw new ApiError(400,'CART_EMPTY','Your cart is empty');
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify([String(cart._id),cart.revision,input.addressId,input.code||'',input.deliveryInstructions])).digest('hex');
    let order=await Order.findOne({userId,checkoutFingerprint:fingerprint,checkoutState:'PENDING_PAYMENT'});
    if(!order){
      const session=await mongoose.startSession();
      try{await session.withTransaction(async()=>{
        const prior=await Order.findOne({userId,checkoutFingerprint:fingerprint,checkoutState:'PENDING_PAYMENT'}).session(session);
        if(prior){order=prior;return;}
        const current=await Cart.findOne({_id:cart._id,userId,revision:cart.revision}).session(session);
        if(!current||!current.items.length)throw new ApiError(409,'CART_CHANGED','Cart changed. Review your cart and retry');
        const address=await Address.findOne({_id:input.addressId,userId}).session(session);
        if(!address)throw new ApiError(404,'ADDRESS_NOT_FOUND','Delivery address not found');
        const quote=await calculateCart(current as CartLike,userId,input.code,session);
        if(!quote.restaurant.isOpen)throw new ApiError(409,'RESTAURANT_CLOSED','Restaurant is closed');
        if(!positivePaise(quote.pricing.totalPaise))throw new ApiError(400,'INVALID_TOTAL','Online checkout requires a positive amount');
        if(quote.coupon){
          const updated=await Coupon.updateOne({code:quote.coupon.code,isActive:true,$expr:{$or:[{$eq:['$usageLimit',0]},{$lt:['$usageCount','$usageLimit']}]}},{$inc:{usageCount:1}},{session});
          if(updated.modifiedCount!==1)throw new ApiError(409,'COUPON_LIMIT','Coupon usage limit reached');
        }
        const now=new Date();
        const [created]=await Order.create([{orderNumber:`FG-${now.toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,userId,restaurantId:current.restaurantId,restaurantSnapshot:{name:quote.restaurant.name,image:quote.restaurant.image,averageDeliveryTime:quote.restaurant.averageDeliveryTime},items:quote.items.map(({key,...item})=>{void key;return item;}),deliveryAddressSnapshot:address.toObject(),deliveryInstructions:input.deliveryInstructions,pricingBreakdown:quote.pricing,couponSnapshot:quote.coupon,paymentMethod:'ONLINE',paymentStatus:'PENDING',checkoutState:'PENDING_PAYMENT',checkoutFingerprint:fingerprint,checkoutCartId:current._id,checkoutCartRevision:current.revision,couponReserved:!!quote.coupon,orderStatus:'PLACED',statusHistory:[],placedAt:now,idempotencyKey:input.idempotencyKey}],{session});
        order=created!;
      });}catch(error){
        if(typeof error==='object'&&error!==null&&'code'in error&&error.code===11000)order=await Order.findOne({userId,checkoutFingerprint:fingerprint,checkoutState:'PENDING_PAYMENT'});
        if(!order)throw error;
      }finally{await session.endSession();}
    }
    if(!order)throw new ApiError(500,'ORDER_MISSING','Pending checkout could not be loaded');
    const active=await Payment.findOne({orderId:order._id,status:{$in:['CREATED','PENDING','AUTHORIZED']}}).sort({createdAt:-1});
    if(active?.razorpayOrderId){res.json({data:{orderId:String(order._id),paymentId:String(active._id),razorpayOrderId:active.razorpayOrderId,amountPaise:active.amountPaise,currency:'INR',keyId:env.RAZORPAY_KEY_ID}});return;}
    if(active)throw new ApiError(409,'PAYMENT_PREPARING','Payment order is being prepared. Retry shortly');
    let payment;
    try{payment=await Payment.create({userId,orderId:order._id,attemptKey:input.idempotencyKey,amountPaise:order.pricingBreakdown.totalPaise,currency:'INR',status:'CREATED'});}
    catch(error){if(typeof error==='object'&&error!==null&&'code'in error&&error.code===11000)throw new ApiError(409,'PAYMENT_PREPARING','Payment request is already being processed');throw error;}
    try{
      const providerOrder=await provider.createOrder({amount:payment.amountPaise,receipt:String(order._id)});
      if(!providerOrder.id||Number(providerOrder.amount)!==payment.amountPaise||providerOrder.currency!=='INR')throw new ApiError(502,'PAYMENT_GATEWAY_ERROR','Payment gateway returned an invalid order');
      payment.razorpayOrderId=providerOrder.id;payment.status='PENDING';await payment.save();
      res.status(201).json({data:{orderId:String(order._id),paymentId:String(payment._id),razorpayOrderId:providerOrder.id,amountPaise:payment.amountPaise,currency:'INR',keyId:env.RAZORPAY_KEY_ID}});
    }catch(error){await Payment.updateOne({_id:payment._id},{$set:{status:'FAILED',failureReason:'Gateway order creation failed'}});await releaseReservation(order._id);if(error instanceof ApiError)throw error;throw new ApiError(502,'PAYMENT_GATEWAY_ERROR','Could not start online payment');}
  };

  const verify:RequestHandler=async(req,res)=>{
    const provider=requireGateway();const input=verifyPaymentSchema.parse(req.body);const userId=res.locals.user._id;
    const payment=await Payment.findOne({orderId:input.orderId,userId,razorpayOrderId:input.razorpayOrderId});
    if(!payment)throw new ApiError(404,'PAYMENT_NOT_FOUND','Payment not found');
    if(!validHmac(`${payment.razorpayOrderId}|${input.razorpayPaymentId}`,env.RAZORPAY_KEY_SECRET!,input.razorpaySignature))throw new ApiError(400,'INVALID_SIGNATURE','Payment signature is invalid');
    const remote=await provider.fetchPayment(input.razorpayPaymentId);
    if(remote.order_id!==payment.razorpayOrderId||Number(remote.amount)!==payment.amountPaise||remote.currency!=='INR'||payment.razorpayPaymentId&&payment.razorpayPaymentId!==remote.id)throw new ApiError(409,'PAYMENT_MISMATCH','Provider payment does not match this order');
    if(remote.status==='captured')await captured(payment._id,remote);
    else if(remote.status==='authorized')await Payment.updateOne({_id:payment._id,status:{$in:['CREATED','PENDING']}},{$set:{status:'AUTHORIZED',razorpayPaymentId:remote.id,method:remote.method||null}});
    else if(remote.status==='failed'){await Payment.updateOne({_id:payment._id,status:{$in:['CREATED','PENDING','AUTHORIZED']}},{$set:{status:'FAILED',razorpayPaymentId:remote.id,failureReason:'Provider reported failure'}});await releaseReservation(payment.orderId);}
    const order=await Order.findOne({_id:payment.orderId,userId});
    res.json({data:{orderId:String(payment.orderId),paymentStatus:order?.paymentStatus||'PENDING',checkoutState:order?.checkoutState||'PENDING_PAYMENT',gatewayStatus:remote.status}});
  };

  const status:RequestHandler=async(req,res)=>{
    const orderId=objectId(req.params.orderId);if(!orderId)throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
    let order=await Order.findOne({_id:orderId,userId:res.locals.user._id,paymentMethod:'ONLINE'});
    if(!order)throw new ApiError(404,'ORDER_NOT_FOUND','Order not found');
    if(order.checkoutState==='PENDING_PAYMENT'&&gateway)try{await reconcile(order._id);order=await Order.findById(order._id);}catch{/* Preserve pending state if the provider is temporarily unavailable. */}
    const payment=await Payment.findOne({orderId:order!._id}).sort({createdAt:-1});
    res.json({data:{orderId:String(order!._id),orderNumber:order!.orderNumber,restaurantName:order!.restaurantSnapshot?.name,amountPaise:order!.pricingBreakdown.totalPaise,paymentStatus:order!.paymentStatus,checkoutState:order!.checkoutState,attemptStatus:payment?.status||null,failureReason:payment?.failureReason||null}});
  };

  async function updateRefundState(refundId:string,status:'PROCESSED'|'FAILED'){
    const refund=await Refund.findOneAndUpdate({razorpayRefundId:refundId,status:'PENDING'},{$set:{status},$push:{statusHistory:{status,at:new Date()}}},{returnDocument:'after'});
    if(!refund)return;
    const payment=await Payment.findById(refund.paymentId);
    if(!payment)return;
    if(status==='FAILED')await Payment.updateOne({_id:payment._id,refundReservedPaise:{$gte:refund.amountPaise}},{$inc:{refundReservedPaise:-refund.amountPaise}});
    else{
      const processed=await Refund.aggregate<{total:number}>([{$match:{paymentId:payment._id,status:'PROCESSED'}},{$group:{_id:null,total:{$sum:'$amountPaise'}}}]);
      const all=(processed[0]?.total||0)>=payment.amountPaise;
      await Payment.updateOne({_id:payment._id},{$set:{status:all?'REFUNDED':'PARTIALLY_REFUNDED'}});
      await Order.updateOne({_id:payment.orderId},{$set:{paymentStatus:all?'REFUNDED':'PARTIALLY_REFUNDED'}});
    }
  }

  const webhook:RequestHandler=async(req,res)=>{
    if(!env.RAZORPAY_WEBHOOK_SECRET)throw new ApiError(503,'WEBHOOK_UNAVAILABLE','Payment webhook is not configured');
    const raw=req.body as unknown;
    const signature=req.header('x-razorpay-signature')||'';const eventId=req.header('x-razorpay-event-id')||'';
    if(!Buffer.isBuffer(raw)||!validHmac(raw,env.RAZORPAY_WEBHOOK_SECRET,signature))throw new ApiError(400,'INVALID_SIGNATURE','Webhook signature is invalid');
    if(!/^[\w-]{4,120}$/.test(eventId))throw new ApiError(400,'INVALID_EVENT','Webhook event ID is required');
    let data:{event?:string;payload?:{payment?:{entity?:GatewayPayment};refund?:{entity?:GatewayRefund}}};
    try{data=JSON.parse(raw.toString('utf8'));}catch{throw new ApiError(400,'INVALID_EVENT','Webhook body must be valid JSON');}
    let seen=await WebhookEvent.findOne({eventId});
    if(seen?.processedAt){res.json({data:{accepted:true,duplicate:true}});return;}
    if(!seen)try{seen=await WebhookEvent.create({eventId,eventType:data.event||'unknown'});}catch{seen=await WebhookEvent.findOne({eventId});}
    const remote=data.payload?.payment?.entity;
    if(data.event==='payment.captured'&&remote?.id&&remote.order_id){
      const payment=await Payment.findOne({razorpayOrderId:remote.order_id});
      if(payment)await captured(payment._id,remote);
    }else if(data.event==='payment.failed'&&remote?.id&&remote.order_id){
      const payment=await Payment.findOneAndUpdate({razorpayOrderId:remote.order_id,status:{$in:['CREATED','PENDING','AUTHORIZED']}},{$set:{status:'FAILED',razorpayPaymentId:remote.id,failureReason:'Provider reported failure'}},{returnDocument:'after'});
      if(payment)await releaseReservation(payment.orderId);
    }else if(data.event==='refund.processed'||data.event==='refund.failed'){
      const remoteRefund=data.payload?.refund?.entity;
      if(remoteRefund?.id){
        if(remoteRefund.receipt&&objectId(remoteRefund.receipt)&&remoteRefund.payment_id&&positivePaise(remoteRefund.amount)){
          const pending=await Refund.findOne({_id:remoteRefund.receipt,status:'PENDING',amountPaise:remoteRefund.amount,razorpayRefundId:{$exists:false}});
          const payment=pending?await Payment.findById(pending.paymentId):null;
          if(payment?.razorpayPaymentId===remoteRefund.payment_id)await Refund.updateOne({_id:pending!._id,status:'PENDING'},{$set:{razorpayRefundId:remoteRefund.id}});
        }
        await updateRefundState(remoteRefund.id,data.event==='refund.processed'?'PROCESSED':'FAILED');
      }
    }
    if(seen)await WebhookEvent.updateOne({_id:seen._id},{$set:{processedAt:new Date()}});
    res.json({data:{accepted:true}});
  };

  const refund:RequestHandler=async(req,res)=>{
    const provider=requireGateway();const paymentId=objectId(req.params.paymentId);if(!paymentId)throw new ApiError(404,'PAYMENT_NOT_FOUND','Payment not found');
    const input=refundSchema.parse(req.body);
    const payment=await Payment.findById(paymentId);
    if(!payment)throw new ApiError(404,'PAYMENT_NOT_FOUND','Payment not found');
    const existing=await Refund.findOne({paymentId,idempotencyKey:input.idempotencyKey});
    if(existing){res.json({data:serialize(existing.toObject())});return;}
    if(!payment.razorpayPaymentId||!['CAPTURED','PARTIALLY_REFUNDED'].includes(payment.status))throw new ApiError(409,'REFUND_NOT_ELIGIBLE','Only captured payments can be refunded');
    const order=await Order.findById(payment.orderId);
    if(!order||order.orderStatus!=='CANCELLED')throw new ApiError(409,'REFUND_NOT_ELIGIBLE','Only cancelled orders are eligible for a refund');
    const reserved=await Payment.findOneAndUpdate({_id:payment._id,$expr:{$lte:[{$add:['$refundReservedPaise',input.amountPaise]},'$amountPaise']}},{$inc:{refundReservedPaise:input.amountPaise}},{returnDocument:'after'});
    if(!reserved){const duplicate=await Refund.findOne({paymentId,idempotencyKey:input.idempotencyKey});if(duplicate){res.json({data:serialize(duplicate.toObject())});return;}throw new ApiError(409,'REFUND_EXCEEDS_PAYMENT','Refund exceeds the remaining captured amount');}
    let record;
    try{record=await Refund.create({paymentId:payment._id,orderId:payment.orderId,idempotencyKey:input.idempotencyKey,amountPaise:input.amountPaise,reason:input.reason,status:'PENDING',requestedBy:res.locals.user._id,statusHistory:[{status:'PENDING',at:new Date(),by:res.locals.user._id}]});}
    catch(error){await Payment.updateOne({_id:payment._id},{$inc:{refundReservedPaise:-input.amountPaise}});if(typeof error==='object'&&error!==null&&'code'in error&&error.code===11000){const row=await Refund.findOne({paymentId,idempotencyKey:input.idempotencyKey});if(row){res.json({data:serialize(row.toObject())});return;}}throw error;}
    await AuditLog.create({actorId:res.locals.user._id,action:'refund.request',resource:'Refund',resourceId:String(record._id),reason:input.reason,changes:{amountPaise:input.amountPaise,paymentId:String(payment._id)}});
    publishAdminNotice('Refund',record._id);
    try{
      const remote=await provider.refundPayment(payment.razorpayPaymentId,{amount:input.amountPaise,receipt:String(record._id)});
      if(remote.payment_id!==payment.razorpayPaymentId||remote.amount!==input.amountPaise)throw new ApiError(502,'REFUND_GATEWAY_ERROR','Refund response did not match the request');
      record.razorpayRefundId=remote.id;await record.save();
      if(remote.status==='processed')await updateRefundState(remote.id,'PROCESSED');
      else if(remote.status==='failed')await updateRefundState(remote.id,'FAILED');
      res.status(201).json({data:serialize((await Refund.findById(record._id))!.toObject())});
    }catch(error){
      // A timeout can happen after the provider accepts a refund. Keep the reservation
      // and audit record pending so a retry cannot issue a second refund.
      if(error instanceof ApiError)throw error;
      throw new ApiError(502,'REFUND_GATEWAY_ERROR','Refund status is pending confirmation');
    }
  };

  const refunds:RequestHandler=async(req,res)=>{
    const paymentId=objectId(req.params.paymentId);if(!paymentId)throw new ApiError(404,'PAYMENT_NOT_FOUND','Payment not found');
    const payment=await Payment.findById(paymentId);
    if(!payment)throw new ApiError(404,'PAYMENT_NOT_FOUND','Payment not found');
    if(gateway&&payment.razorpayPaymentId&&await Refund.exists({paymentId,status:'PENDING'})){
      try{
        const remote=await gateway.fetchPaymentRefunds(payment.razorpayPaymentId);
        for(const row of remote){
          if(!row.id||row.payment_id!==payment.razorpayPaymentId||!positivePaise(row.amount))continue;
          const local=await Refund.findOne({paymentId,status:'PENDING',$or:[{razorpayRefundId:row.id},{_id:objectId(row.receipt)}],amountPaise:row.amount});
          if(!local)continue;
          if(!local.razorpayRefundId)await Refund.updateOne({_id:local._id,status:'PENDING'},{$set:{razorpayRefundId:row.id}});
          if(row.status==='processed'||row.status==='failed')await updateRefundState(row.id,row.status==='processed'?'PROCESSED':'FAILED');
        }
      }catch{/* Keep pending records if the provider is temporarily unavailable. */}
    }
    const rows=await Refund.find({paymentId}).sort({createdAt:-1}).lean();
    res.json({data:rows.map(serialize)});
  };

  return {createOrder,verify,status,webhook,refund,refunds};
}
