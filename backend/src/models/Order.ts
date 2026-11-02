import { Schema, model } from 'mongoose';
const selectionSchema = new Schema({group:String,options:[{name:String,pricePaise:Number}]},{_id:false});
const itemSchema = new Schema({menuItemId:Schema.Types.ObjectId,name:String,image:String,quantity:Number,unitPricePaise:Number,selections:[selectionSchema],customizationPaise:Number,totalPaise:Number,specialInstructions:String},{_id:false});
const statusSchema = new Schema({status:String,at:Date,by:Schema.Types.ObjectId},{_id:false});
const schema = new Schema({
  orderNumber:{type:String,required:true,unique:true},userId:{type:Schema.Types.ObjectId,ref:'User',required:true},
  restaurantId:{type:Schema.Types.ObjectId,ref:'Restaurant',required:true},restaurantSnapshot:{name:String,image:String,averageDeliveryTime:Number},
  items:{type:[itemSchema],required:true},deliveryAddressSnapshot:{type:Schema.Types.Mixed,required:true},deliveryInstructions:{type:String,maxlength:300,default:''},
  pricingBreakdown:{type:Schema.Types.Mixed,required:true},couponSnapshot:{type:Schema.Types.Mixed,default:null},
  paymentMethod:{type:String,enum:['COD','ONLINE'],required:true},paymentStatus:{type:String,enum:['PENDING','AUTHORIZED','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED'],default:'PENDING'},
  checkoutState:{type:String,enum:['PENDING_PAYMENT','CONFIRMED','FAILED'],default:'CONFIRMED'},checkoutFingerprint:{type:String,default:null},
  checkoutCartId:{type:Schema.Types.ObjectId,ref:'Cart',default:null},checkoutCartRevision:{type:Number,default:null},couponReserved:{type:Boolean,default:false},
  orderStatus:{type:String,enum:['PLACED','CONFIRMED','PREPARING','READY_FOR_PICKUP','PICKED_UP','ON_THE_WAY','DELIVERED','CANCELLED'],default:'PLACED'},
  statusHistory:{type:[statusSchema],default:[]},placedAt:{type:Date,required:true},deliveredAt:Date,cancelledAt:Date,cancellationReason:String,
  assignedDeliveryPartnerId:{type:Schema.Types.ObjectId,ref:'User',default:null},assignmentHistory:{type:[new Schema({partnerId:Schema.Types.ObjectId,at:Date,by:Schema.Types.ObjectId},{_id:false})],default:[]},idempotencyKey:{type:String,required:true},
}, {timestamps:true,versionKey:false});
schema.index({userId:1,idempotencyKey:1},{unique:true});
schema.index({userId:1,createdAt:-1});
schema.index({userId:1,orderStatus:1,createdAt:-1});
schema.index({restaurantId:1,orderStatus:1});
schema.index({createdAt:-1,orderStatus:1});
schema.index({restaurantId:1,createdAt:-1});
schema.index({userId:1,checkoutFingerprint:1},{unique:true,partialFilterExpression:{checkoutState:'PENDING_PAYMENT'}});
export const Order = model('Order',schema);
