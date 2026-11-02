import { Schema, model } from 'mongoose';

const pointSchema=new Schema({type:{type:String,enum:['Point'],default:'Point'},coordinates:{type:[Number],required:true}},{_id:false});
const schema=new Schema({
  userId:{type:Schema.Types.ObjectId,ref:'User',required:true,unique:true},
  phone:{type:String,required:true},vehicleType:{type:String,enum:['BIKE','SCOOTER','CYCLE','CAR'],required:true},vehicleNumber:{type:String,required:true},
  isVerified:{type:Boolean,default:false},isAvailable:{type:Boolean,default:false},
  currentLocation:{type:pointSchema,default:undefined},lastLocationUpdatedAt:{type:Date,default:null},
  activeDeliveryId:{type:Schema.Types.ObjectId,ref:'DeliveryAssignment',default:null},trackingEnabled:{type:Boolean,default:false},
}, {timestamps:true,versionKey:false});
schema.index({currentLocation:'2dsphere'});
export const DeliveryPartner=model('DeliveryPartner',schema);
