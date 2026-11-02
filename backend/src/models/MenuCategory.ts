import { Schema, model } from 'mongoose';
const schema = new Schema({
  restaurantId: {type:Schema.Types.ObjectId,ref:'Restaurant',required:true},
  name: {type:String,required:true,trim:true},
  sortOrder: {type:Number,default:0},
}, {timestamps:true,versionKey:false});
schema.index({restaurantId:1,sortOrder:1});
schema.index({restaurantId:1,name:1},{unique:true});
schema.index({name:1});
export const MenuCategory = model('MenuCategory',schema);
