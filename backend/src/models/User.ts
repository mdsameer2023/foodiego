import { Schema, model, type InferSchemaType } from 'mongoose';
export const roles = ['CUSTOMER','RESTAURANT_OWNER','DELIVERY_PARTNER','ADMIN'] as const;
const userSchema = new Schema({
  name: {type:String,required:true,trim:true,maxlength:80},
  email: {type:String,required:true,lowercase:true,trim:true,maxlength:254},
  phone: {type:String,trim:true,default:null},
  passwordHash: {type:String,required:true,select:false},
  avatar: {type:String,default:null},
  role: {type:String,enum:roles,default:'CUSTOMER',required:true},
  isActive: {type:Boolean,default:true},
  isEmailVerified: {type:Boolean,default:false},
}, {timestamps:true,versionKey:false});
userSchema.index({email:1},{unique:true});
export type UserRecord = InferSchemaType<typeof userSchema>;
export const User = model('User',userSchema);
