import { Schema, model } from 'mongoose';

const schema=new Schema({eventId:{type:String,required:true,unique:true},eventType:{type:String,required:true},receivedAt:{type:Date,default:Date.now},processedAt:{type:Date,default:null}}, {versionKey:false});
schema.index({receivedAt:1},{expireAfterSeconds:60*60*24*90});
export const WebhookEvent=model('WebhookEvent',schema);
