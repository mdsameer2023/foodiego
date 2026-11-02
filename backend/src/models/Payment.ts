import { Schema, model } from 'mongoose';

const schema = new Schema({
  userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  orderId:{type:Schema.Types.ObjectId,ref:'Order',required:true,index:true},
  attemptKey:{type:String,required:true},
  razorpayOrderId:{type:String},
  razorpayPaymentId:{type:String},
  amountPaise:{type:Number,required:true,min:1,validate:Number.isSafeInteger},
  currency:{type:String,enum:['INR'],default:'INR'},
  method:{type:String,default:null},
  status:{type:String,enum:['CREATED','PENDING','AUTHORIZED','CAPTURED','FAILED','REFUNDED','PARTIALLY_REFUNDED'],default:'CREATED'},
  failureReason:{type:String,default:null},verifiedAt:{type:Date,default:null},
  refundReservedPaise:{type:Number,min:0,default:0},
}, {timestamps:true,versionKey:false});
schema.index({orderId:1,attemptKey:1},{unique:true});
schema.index({razorpayOrderId:1},{unique:true,sparse:true});
schema.index({razorpayPaymentId:1},{unique:true,sparse:true});
export const Payment=model('Payment',schema);
