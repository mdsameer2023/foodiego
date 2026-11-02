import { Schema, model } from 'mongoose';
const schema = new Schema({
  userId: {type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  tokenHash: {type:String,required:true,unique:true},
  expiresAt: {type:Date,required:true},
}, {timestamps:true,versionKey:false});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export const PasswordReset = model('PasswordReset',schema);
