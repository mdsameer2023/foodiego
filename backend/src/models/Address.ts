import { Schema, model } from 'mongoose';
const schema = new Schema({
  userId: {type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  fullName: {type:String,required:true,trim:true,maxlength:80},
  phone: {type:String,required:true,trim:true},
  addressLine1: {type:String,required:true,trim:true,maxlength:160},
  addressLine2: {type:String,trim:true,default:''},
  landmark: {type:String,trim:true,default:''},
  city: {type:String,required:true,trim:true},
  state: {type:String,required:true,trim:true},
  postalCode: {type:String,required:true,trim:true},
  latitude: {type:Number,min:-90,max:90},
  longitude: {type:Number,min:-180,max:180},
  addressType: {type:String,enum:['HOME','WORK','OTHER'],default:'HOME'},
  isDefault: {type:Boolean,default:false},
}, {timestamps:true,versionKey:false});
schema.index({userId:1,isDefault:1},{unique:true,partialFilterExpression:{isDefault:true}});
export const Address = model('Address',schema);
