import type { RequestHandler } from 'express';
import { z } from 'zod';
import { MenuItem } from '../models/MenuItem.js';
import { Restaurant } from '../models/Restaurant.js';
import { escapeRegex } from './restaurants.js';

const query = z.object({q:z.string().trim().min(2).max(80),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(30).default(12)}).strict();
export const searchMenuItems:RequestHandler = async (req,res) => {
  const input=query.parse(req.query);
  const approved=await Restaurant.find({isApproved:true}).select('_id').lean();
  const filter={restaurantId:{$in:approved.map(row=>row._id)},isAvailable:true,name:{$regex:escapeRegex(input.q),$options:'i'}};
  const [rows,total]=await Promise.all([MenuItem.find(filter).sort({name:1,_id:1}).skip((input.page-1)*input.limit).limit(input.limit).populate({path:'restaurantId',match:{isApproved:true},select:'demoId name'}).lean(),MenuItem.countDocuments(filter)]);
  res.json({data:rows.filter(r=>r.restaurantId).map(r=>({...r,id:String(r._id),restaurantId:String((r.restaurantId as unknown as {_id:unknown})._id)})),meta:{page:input.page,limit:input.limit,total,pages:Math.ceil(total/input.limit)}});
};
export const trendingMenuItems:RequestHandler = async (_req,res) => {
  const approved=await Restaurant.find({isApproved:true}).select('_id').lean();
  const rows=await MenuItem.find({restaurantId:{$in:approved.map(row=>row._id)},isAvailable:true,isPopular:true}).sort({createdAt:-1,_id:1}).limit(6).populate('restaurantId','demoId name').lean();
  res.json({data:rows.filter(r=>r.restaurantId).map(r=>({...r,id:String(r._id),restaurantId:String((r.restaurantId as unknown as {_id:unknown})._id)}))});
};
