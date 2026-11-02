import type { RequestHandler } from 'express';
import { Cart } from '../models/Cart.js';
import { Address } from '../models/Address.js';
import { quoteSchema } from '../validators/commerce.js';
import { calculateCart, type CartLike } from '../services/pricing.js';
import { ApiError } from '../utils/errors.js';

export const checkoutQuote:RequestHandler=async (req,res)=>{
  const input=quoteSchema.parse(req.body);const userId=res.locals.user._id;
  const cart=await Cart.findOne({userId});if (!cart || !cart.items.length) throw new ApiError(400,'CART_EMPTY','Your cart is empty');
  if (input.addressId && !(await Address.exists({_id:input.addressId,userId}))) throw new ApiError(404,'ADDRESS_NOT_FOUND','Delivery address not found');
  res.json({data:await calculateCart(cart as CartLike,userId,input.code)});
};
