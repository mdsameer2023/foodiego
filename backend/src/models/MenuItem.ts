import { Schema, model } from 'mongoose';
const customizationSchema = new Schema({name:{type:String,required:true},required:{type:Boolean,default:false},minSelections:{type:Number,min:0,default:0},maxSelections:{type:Number,min:1,default:1},options:[{name:{type:String,required:true},price:{type:Number,min:0,required:true}}]}, {_id:false});
const schema = new Schema({
  demoId: {type:String,index:true,sparse:true,unique:true},
  restaurantId: {type:Schema.Types.ObjectId,ref:'Restaurant',required:true},
  categoryId: {type:Schema.Types.ObjectId,ref:'MenuCategory',required:true},
  name: {type:String,required:true,trim:true},
  description: {type:String,default:''},
  price: {type:Number,min:0,required:true},
  image: {type:String,default:''},
  isVegetarian: {type:Boolean,required:true},
  isAvailable: {type:Boolean,default:true},
  isPopular: {type:Boolean,default:false},
  isSample: {type:Boolean,default:false},
  customizationOptions: {type:[customizationSchema],default:[]},
}, {timestamps:true,versionKey:false});
schema.index({restaurantId:1,categoryId:1,isAvailable:1});
schema.index({restaurantId:1,name:1});
schema.index({name:1,isAvailable:1});
schema.index({isAvailable:1,price:1,_id:1});
export const MenuItem = model('MenuItem',schema);
