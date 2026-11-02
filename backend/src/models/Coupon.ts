import { Schema, model } from 'mongoose';
const schema = new Schema({
  code:{type:String,required:true,unique:true,uppercase:true,trim:true},description:{type:String,default:''},
  discountType:{type:String,enum:['PERCENT','FIXED'],required:true},discountValue:{type:Number,min:0,required:true},
  maxDiscountPaise:{type:Number,min:0,default:0},minimumOrderPaise:{type:Number,min:0,default:0},
  usageLimit:{type:Number,min:0,default:0},perUserLimit:{type:Number,min:0,default:0},usageCount:{type:Number,min:0,default:0},
  validFrom:{type:Date,required:true},expiresAt:{type:Date,required:true},
  applicableRestaurantIds:{type:[Schema.Types.ObjectId],default:[]},isActive:{type:Boolean,default:true},isSample:{type:Boolean,default:false},
}, {timestamps:true,versionKey:false});
schema.index({isActive:1,validFrom:1,expiresAt:1});
export const Coupon = model('Coupon',schema);
