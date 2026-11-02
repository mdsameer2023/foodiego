import { Schema, model } from 'mongoose';

const schema=new Schema({
  paymentId:{type:Schema.Types.ObjectId,ref:'Payment',required:true,index:true},
  orderId:{type:Schema.Types.ObjectId,ref:'Order',required:true,index:true},
  razorpayRefundId:{type:String},
  idempotencyKey:{type:String,required:true},
  amountPaise:{type:Number,required:true,min:1,validate:Number.isSafeInteger},
  reason:{type:String,required:true,maxlength:300},
  status:{type:String,enum:['PENDING','PROCESSED','FAILED'],default:'PENDING'},
  requestedBy:{type:Schema.Types.ObjectId,ref:'User',required:true},
  statusHistory:{type:[new Schema({status:String,at:Date,by:Schema.Types.ObjectId},{_id:false})],default:[]},
}, {timestamps:true,versionKey:false});
schema.index({paymentId:1,idempotencyKey:1},{unique:true});
schema.index({razorpayRefundId:1},{unique:true,sparse:true});
export const Refund=model('Refund',schema);
