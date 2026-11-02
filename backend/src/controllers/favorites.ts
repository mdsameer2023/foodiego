import type { RequestHandler } from 'express';
import { z } from 'zod';
import { Favorite } from '../models/Favorite.js';
import { findPublicRestaurant, byId } from './restaurants.js';
import { Restaurant } from '../models/Restaurant.js';
import { ApiError } from '../utils/errors.js';

export const listFavorites:RequestHandler = async (_req,res) => {
  const rows = await Favorite.find({userId:res.locals.user._id}).sort({createdAt:-1}).populate({path:'restaurantId',match:{isApproved:true}}).lean();
  res.json({data:rows.filter(row=>row.restaurantId).map(row=>({id:String(row._id),restaurant:row.restaurantId}))});
};
export const addFavorite:RequestHandler = async (req,res) => {
  const {restaurantId} = z.object({restaurantId:z.string().min(1)}).strict().parse(req.body);
  const row = await findPublicRestaurant(restaurantId);
  if (!row) throw new ApiError(404,'NOT_FOUND','Restaurant not found');
  await Favorite.updateOne({userId:res.locals.user._id,restaurantId:row._id},{$setOnInsert:{userId:res.locals.user._id,restaurantId:row._id}},{upsert:true});
  res.status(201).json({data:{restaurantId:row.demoId || String(row._id)}});
};
export const removeFavorite:RequestHandler = async (req,res) => {
  const id = String(req.params.restaurantId);
  const row = await Restaurant.findOne(byId(id)).select('_id').lean();
  if (!row) throw new ApiError(404,'NOT_FOUND','Restaurant not found');
  await Favorite.deleteOne({userId:res.locals.user._id,restaurantId:row._id});
  res.status(204).end();
};
