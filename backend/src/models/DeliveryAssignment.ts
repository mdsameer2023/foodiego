import { Schema, model } from 'mongoose';

const pointSchema=new Schema({type:{type:String,enum:['Point'],default:'Point'},coordinates:{type:[Number],required:true}},{_id:false});
const schema=new Schema({
  orderId:{type:Schema.Types.ObjectId,ref:'Order',required:true,unique:true},
  deliveryPartnerId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  restaurantId:{type:Schema.Types.ObjectId,ref:'Restaurant',required:true},
  pickupLocation:{type:pointSchema,default:undefined},deliveryLocation:{type:pointSchema,default:undefined},
  assignmentStatus:{type:String,enum:['OFFERED','ACCEPTED','REJECTED','PICKED_UP','ON_THE_WAY','DELIVERED','CANCELLED'],default:'OFFERED'},
  assignedAt:{type:Date,default:Date.now},acceptedAt:Date,pickedUpAt:Date,deliveredAt:Date,
  trackingEnabled:{type:Boolean,default:false},
  completionCodeHash:{type:String,select:false,default:null},
  completionCodeExpiresAt:{type:Date,default:null},
  completionAttempts:{type:Number,default:0},
  completionVerifiedAt:{type:Date,default:null},
  history:{type:[new Schema({status:String,at:Date,by:Schema.Types.ObjectId},{_id:false})],default:[]},
}, {timestamps:true,versionKey:false});
schema.index({deliveryPartnerId:1,assignmentStatus:1});
schema.index({deliveryPartnerId:1,deliveredAt:-1});
export const DeliveryAssignment=model('DeliveryAssignment',schema);
