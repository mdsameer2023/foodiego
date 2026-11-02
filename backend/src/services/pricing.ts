import crypto from 'node:crypto';
import type { ClientSession, Types } from 'mongoose';
import { MenuItem } from '../models/MenuItem.js';
import { Restaurant } from '../models/Restaurant.js';
import { Coupon } from '../models/Coupon.js';
import { Order } from '../models/Order.js';
import { ApiError } from '../utils/errors.js';

export type Selection = {group:string;options:string[]};
export type CartLine = {key:string;menuItemId:Types.ObjectId;quantity:number;selections:Selection[];specialInstructions:string};
export type CartLike = {restaurantId:Types.ObjectId;items:CartLine[]};
export const paise = (rupees:number) => {
  if (!Number.isFinite(rupees) || rupees<0) throw new ApiError(400,'INVALID_PRICE','Invalid menu price');
  return Math.round(rupees*100);
};
export function lineKey(menuItemId:string,selections:Selection[]) {
  const canonical=selections.map(s=>({group:s.group,options:[...s.options].sort()})).sort((a,b)=>a.group.localeCompare(b.group));
  return crypto.createHash('sha256').update(JSON.stringify({menuItemId,canonical})).digest('hex').slice(0,32);
}
export function validateSelections(groups: Array<{name:string;required?:boolean;minSelections?:number;maxSelections?:number;options:Array<{name:string;price:number}>}>, selections:Selection[]) {
  if (new Set(selections.map(s=>s.group)).size!==selections.length) throw new ApiError(400,'INVALID_CUSTOMIZATION','Duplicate customization group');
  let extra=0;
  const result: Array<{group:string;options:Array<{name:string;pricePaise:number}>}>=[];
  for (const selection of selections) if (!groups.some(group=>group.name===selection.group)) throw new ApiError(400,'INVALID_CUSTOMIZATION','Unknown customization group');
  for (const group of groups) {
    const chosen=selections.find(s=>s.group===group.name)?.options || [];
    const minimum=group.minSelections ?? (group.required?1:0);
    const maximum=group.maxSelections ?? 1;
    if (chosen.length<minimum || chosen.length>maximum || new Set(chosen).size!==chosen.length) throw new ApiError(400,'INVALID_CUSTOMIZATION','Invalid customization selection count');
    const options=chosen.map(name=>{
      const option=group.options.find(item=>item.name===name);
      if (!option) throw new ApiError(400,'INVALID_CUSTOMIZATION','Unknown customization option');
      const pricePaise=paise(option.price);extra+=pricePaise;
      return {name,pricePaise};
    });
    if (options.length) result.push({group:group.name,options});
  }
  return {extraPaise:extra,selections:result};
}
export async function couponFor(code:string,userId:Types.ObjectId,restaurantId:Types.ObjectId,subtotalPaise:number,session?:ClientSession) {
  const now=new Date();
  const coupon=await Coupon.findOne({code:code.trim().toUpperCase(),isActive:true,validFrom:{$lte:now},expiresAt:{$gt:now}}).session(session || null);
  if (!coupon) throw new ApiError(400,'COUPON_INVALID','Coupon is unavailable or expired');
  if (coupon.applicableRestaurantIds.length && !coupon.applicableRestaurantIds.some(id=>String(id)===String(restaurantId))) throw new ApiError(400,'COUPON_RESTRICTED','Coupon does not apply to this restaurant');
  if (subtotalPaise<coupon.minimumOrderPaise) throw new ApiError(400,'COUPON_MINIMUM','Order does not meet coupon minimum');
  if (coupon.usageLimit && coupon.usageCount>=coupon.usageLimit) throw new ApiError(400,'COUPON_LIMIT','Coupon usage limit reached');
  if (coupon.perUserLimit) {
    const used=await Order.countDocuments({userId,'couponSnapshot.code':coupon.code}).session(session || null);
    if (used>=coupon.perUserLimit) throw new ApiError(400,'COUPON_LIMIT','Your coupon usage limit was reached');
  }
  let discountPaise=coupon.discountType==='FIXED'?coupon.discountValue:Math.floor(subtotalPaise*coupon.discountValue/100);
  if (coupon.maxDiscountPaise) discountPaise=Math.min(discountPaise,coupon.maxDiscountPaise);
  discountPaise=Math.min(subtotalPaise,discountPaise);
  return {coupon,discountPaise};
}
export async function calculateCart(cart:CartLike,userId:Types.ObjectId,code?:string,session?:ClientSession) {
  const restaurant=await Restaurant.findOne({_id:cart.restaurantId,isApproved:true}).session(session || null);
  if (!restaurant) throw new ApiError(404,'RESTAURANT_NOT_FOUND','Restaurant is unavailable');
  const docs=await MenuItem.find({_id:{$in:cart.items.map(i=>i.menuItemId)}}).session(session || null);
  const byId=new Map(docs.map(item=>[String(item._id),item]));
  let subtotalPaise=0;let customizationPaise=0;
  const items=cart.items.map(line=>{
    const item=byId.get(String(line.menuItemId));
    if (!item || String(item.restaurantId)!==String(cart.restaurantId) || !item.isAvailable) throw new ApiError(409,'ITEM_UNAVAILABLE','An item in your cart is unavailable');
    if (!Number.isInteger(line.quantity) || line.quantity<1 || line.quantity>20) throw new ApiError(400,'INVALID_QUANTITY','Quantity must be between 1 and 20');
    const validated=validateSelections(item.customizationOptions,line.selections);
    const unitPricePaise=paise(item.price);
    const totalPaise=(unitPricePaise+validated.extraPaise)*line.quantity;
    subtotalPaise+=unitPricePaise*line.quantity;customizationPaise+=validated.extraPaise*line.quantity;
    return {key:line.key,menuItemId:String(item._id),name:item.name,image:item.image,quantity:line.quantity,unitPricePaise,selections:validated.selections,customizationPaise:validated.extraPaise,totalPaise,specialInstructions:line.specialInstructions};
  });
  const deliveryFeePaise=items.length?restaurant.deliveryFeePaise:0;
  const packagingFeePaise=items.length?restaurant.packagingFeePaise:0;
  const taxPaise=Math.round((subtotalPaise+customizationPaise)*restaurant.taxRateBasisPoints/10000);
  const applied=code && items.length?await couponFor(code,userId,cart.restaurantId,subtotalPaise+customizationPaise,session):null;
  const discountPaise=applied?.discountPaise || 0;
  return {restaurant:{id:String(restaurant._id),name:restaurant.name,image:restaurant.images[0] || '',averageDeliveryTime:restaurant.averageDeliveryTime,isOpen:restaurant.isOpen,codEnabled:restaurant.codEnabled},items,pricing:{subtotalPaise,customizationPaise,deliveryFeePaise,packagingFeePaise,taxPaise,discountPaise,totalPaise:subtotalPaise+customizationPaise+deliveryFeePaise+packagingFeePaise+taxPaise-discountPaise},coupon:applied?{code:applied.coupon.code,discountPaise}:null};
}
