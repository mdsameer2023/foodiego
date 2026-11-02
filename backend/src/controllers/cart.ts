import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { Cart } from '../models/Cart.js';
import { MenuItem } from '../models/MenuItem.js';
import { Restaurant } from '../models/Restaurant.js';
import { addCartItemSchema, patchCartItemSchema } from '../validators/commerce.js';
import { ApiError } from '../utils/errors.js';
import { calculateCart, lineKey, validateSelections, type CartLike } from '../services/pricing.js';

async function responseCart(userId:mongoose.Types.ObjectId) {
  const cart=await Cart.findOne({userId});
  if (!cart) return {restaurant:null,items:[],pricing:{subtotalPaise:0,customizationPaise:0,deliveryFeePaise:0,packagingFeePaise:0,taxPaise:0,discountPaise:0,totalPaise:0}};
  return calculateCart(cart as CartLike,userId);
}
async function mutateCart(userId:mongoose.Types.ObjectId,update:(cart:NonNullable<Awaited<ReturnType<typeof Cart.findOne>>>)=>void) {
  for (let attempt=0;attempt<4;attempt++) {
    const cart=await Cart.findOne({userId});
    if (!cart) throw new ApiError(404,'CART_EMPTY','Cart is empty');
    update(cart);
    try { await cart.save();return; }
    catch (error) {if (!(error instanceof mongoose.Error.VersionError) || attempt===3) throw error;}
  }
}
export const getCart:RequestHandler=async (_req,res)=>{res.json({data:await responseCart(res.locals.user._id)});};
export const addCartItem:RequestHandler=async (req,res)=>{
  const input=addCartItemSchema.parse(req.body);
  const userId=res.locals.user._id as mongoose.Types.ObjectId;
  const item=await MenuItem.findById(input.menuItemId);
  if (!item || !item.isAvailable) throw new ApiError(404,'ITEM_UNAVAILABLE','Menu item is unavailable');
  const restaurant=await Restaurant.findOne({_id:item.restaurantId,isApproved:true});
  if (!restaurant || !restaurant.isOpen) throw new ApiError(409,'RESTAURANT_CLOSED','Restaurant is unavailable for orders');
  validateSelections(item.customizationOptions,input.selections);
  const key=lineKey(input.menuItemId,input.selections);
  for (let attempt=0;attempt<4;attempt++) {
    let cart=await Cart.findOne({userId});
    if (!cart) {
      try { cart=await Cart.create({userId,restaurantId:item.restaurantId,items:[]}); }
      catch (error) {if (typeof error==='object' && error!==null && 'code' in error && error.code===11000) continue;throw error;}
    }
    if (String(cart.restaurantId)!==String(item.restaurantId)) throw new ApiError(409,'CART_RESTAURANT_CONFLICT','Your cart contains items from another restaurant');
    const existing=cart.items.find(line=>line.key===key);
    if (existing) {
      if (existing.quantity+input.quantity>20) throw new ApiError(400,'INVALID_QUANTITY','Maximum quantity is 20');
      existing.quantity+=input.quantity;
    } else cart.items.push({key,menuItemId:item._id,quantity:input.quantity,selections:input.selections,specialInstructions:input.specialInstructions});
    try {await cart.save();res.status(201).json({data:await responseCart(userId)});return;}
    catch (error) {if (!(error instanceof mongoose.Error.VersionError) || attempt===3) throw error;}
  }
};
export const patchCartItem:RequestHandler=async (req,res)=>{
  const input=patchCartItemSchema.parse(req.body);const key=String(req.params.itemId);const userId=res.locals.user._id as mongoose.Types.ObjectId;
  await mutateCart(userId,cart=>{
    const line=cart.items.find(item=>item.key===key);
    if (!line) throw new ApiError(404,'ITEM_NOT_FOUND','Cart item not found');
    if (input.quantity===0) cart.items.splice(cart.items.findIndex(item=>item.key===key),1);
    else {if (input.quantity!==undefined) line.quantity=input.quantity;if (input.specialInstructions!==undefined) line.specialInstructions=input.specialInstructions;}
  });
  const cart=await Cart.findOne({userId});if (cart && !cart.items.length) await Cart.deleteOne({_id:cart._id,revision:cart.revision});
  res.json({data:await responseCart(userId)});
};
export const deleteCartItem:RequestHandler=async (req,res)=>{
  const key=String(req.params.itemId);const userId=res.locals.user._id as mongoose.Types.ObjectId;
  await mutateCart(userId,cart=>{const index=cart.items.findIndex(item=>item.key===key);if (index<0) throw new ApiError(404,'ITEM_NOT_FOUND','Cart item not found');cart.items.splice(index,1);});
  const cart=await Cart.findOne({userId});if (cart && !cart.items.length) await Cart.deleteOne({_id:cart._id,revision:cart.revision});
  res.json({data:await responseCart(userId)});
};
export const clearCart:RequestHandler=async (_req,res)=>{await Cart.deleteOne({userId:res.locals.user._id});res.json({data:await responseCart(res.locals.user._id)});};
