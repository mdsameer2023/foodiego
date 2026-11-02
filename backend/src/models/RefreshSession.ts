import { Schema, model } from 'mongoose';
const schema = new Schema({
  userId: {type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  sessionId: {type:String,required:true,unique:true},
  tokenHash: {type:String,required:true,unique:true,select:false},
  expiresAt: {type:Date,required:true},
}, {timestamps:true,versionKey:false});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export const RefreshSession = model('RefreshSession',schema);
