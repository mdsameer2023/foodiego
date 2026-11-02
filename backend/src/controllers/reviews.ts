import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Review } from '../models/Review.js';
import { Restaurant } from '../models/Restaurant.js';
import { findPublicRestaurant } from './restaurants.js';
import { ApiError } from '../utils/errors.js';

const reviewBody = z.object({rating:z.number().int().min(1).max(5),comment:z.string().trim().min(3).max(1000)}).strict();
export async function refreshRating(restaurantId:mongoose.Types.ObjectId) {
  const [stats] = await Review.aggregate([{$match:{restaurantId,isHidden:{$ne:true}}},{$group:{_id:'$restaurantId',rating:{$avg:'$rating'},reviewCount:{$sum:1}}}]);
  await Restaurant.updateOne({_id:restaurantId},{$set:{rating:stats ? Math.round(stats.rating*10)/10 : 0,reviewCount:stats?.reviewCount ?? 0}});
}
export const createReview:RequestHandler = async (req,res) => {
  const input = reviewBody.parse(req.body);
  const restaurant = await findPublicRestaurant(String(req.params.id));
  if (!restaurant) throw new ApiError(404,'NOT_FOUND','Restaurant not found');
  const exists = await Review.exists({userId:res.locals.user._id,restaurantId:restaurant._id});
  if (exists) throw new ApiError(409,'CONFLICT','You have already reviewed this restaurant');
  const review = await Review.create({...input,userId:res.locals.user._id,restaurantId:restaurant._id});
  await refreshRating(restaurant._id);
  res.status(201).json({data:{id:String(review._id),rating:review.rating,comment:review.comment}});
};
export const updateReview:RequestHandler = async (req,res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400,'VALIDATION_ERROR','Invalid review ID');
  const input = reviewBody.partial().refine(v=>Object.keys(v).length>0).parse(req.body);
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404,'NOT_FOUND','Review not found');
  if (String(review.userId)!==String(res.locals.user._id)) throw new ApiError(403,'FORBIDDEN','You can only edit your own review');
  review.set(input);
  await review.save();
  await refreshRating(review.restaurantId);
  res.json({data:{id:String(review._id),rating:review.rating,comment:review.comment}});
};
export const deleteReview:RequestHandler = async (req,res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400,'VALIDATION_ERROR','Invalid review ID');
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404,'NOT_FOUND','Review not found');
  if (String(review.userId)!==String(res.locals.user._id)) throw new ApiError(403,'FORBIDDEN','You can only delete your own review');
  await review.deleteOne();
  await refreshRating(review.restaurantId);
  res.status(204).end();
};
