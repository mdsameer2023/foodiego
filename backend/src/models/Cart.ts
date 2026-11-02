import { Schema, model } from 'mongoose';

const selectionSchema = new Schema({group:{type:String,required:true},options:{type:[String],required:true}}, {_id:false});
const itemSchema = new Schema({
  key:{type:String,required:true},
  menuItemId:{type:Schema.Types.ObjectId,ref:'MenuItem',required:true},
  quantity:{type:Number,min:1,max:20,required:true},
  selections:{type:[selectionSchema],default:[]},
  specialInstructions:{type:String,maxlength:300,default:''},
}, {_id:false});
const schema = new Schema({userId:{type:Schema.Types.ObjectId,ref:'User',required:true,unique:true},restaurantId:{type:Schema.Types.ObjectId,ref:'Restaurant',required:true},items:{type:[itemSchema],default:[]}}, {timestamps:true,versionKey:'revision',optimisticConcurrency:true});
export const Cart = model('Cart',schema);
