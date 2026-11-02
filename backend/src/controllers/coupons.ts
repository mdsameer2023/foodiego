import type { RequestHandler } from 'express';
import { Coupon } from '../models/Coupon.js';
import { Cart } from '../models/Cart.js';
import { couponCodeSchema } from '../validators/commerce.js';
import { calculateCart, couponFor, type CartLike } from '../services/pricing.js';
import { ApiError } from '../utils/errors.js';

export const availableCoupons:RequestHandler=async (_req,res)=>{
  const now=new Date();const userId=res.locals.user._id;
  const cart=await Cart.findOne({userId});
  if (!cart || !cart.items.length) {res.json({data:[]});return;}
  const quote=await calculateCart(cart as CartLike,userId);
  const rows=await Coupon.find({isActive:true,validFrom:{$lte:now},expiresAt:{$gt:now}}).sort({code:1}).lean();
  const eligible=await Promise.all(rows.map(async row=>{try{await couponFor(row.code,userId,cart.restaurantId,quote.pricing.subtotalPaise+quote.pricing.customizationPaise);return true;}catch{return false;}}));
  const applicable=rows.filter((_row,index)=>eligible[index]);
  res.json({data:applicable.map(row=>({code:row.code,description:row.description,discountType:row.discountType,discountValue:row.discountValue,maxDiscountPaise:row.maxDiscountPaise,minimumOrderPaise:row.minimumOrderPaise,expiresAt:row.expiresAt,isSample:row.isSample}))});
};
export const validateCoupon:RequestHandler=async (req,res)=>{
  const {code}=couponCodeSchema.parse(req.body);const userId=res.locals.user._id;
  const cart=await Cart.findOne({userId});if (!cart || !cart.items.length) throw new ApiError(400,'CART_EMPTY','Add items before applying a coupon');
  res.json({data:await calculateCart(cart as CartLike,userId,code)});
};
