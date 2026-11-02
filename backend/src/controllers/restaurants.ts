import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { Restaurant } from '../models/Restaurant.js';
import { MenuCategory } from '../models/MenuCategory.js';
import { MenuItem } from '../models/MenuItem.js';
import { restaurantQuerySchema } from '../validators/restaurant.js';
import { ApiError } from '../utils/errors.js';
import { z } from 'zod';
import { Review } from '../models/Review.js';

export function byId(id: string) { return mongoose.isValidObjectId(id) ? {$or:[{_id:id},{demoId:id}]} : {demoId:id}; }
function publicRestaurant(row: Record<string,unknown>) { return {...row,id:String(row._id)}; }
export function escapeRegex(value:string) { return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
const menuQuery = z.object({category:z.string().max(80).optional(),search:z.string().trim().max(80).optional(),vegetarian:z.enum(['true','false']).optional(),popular:z.enum(['true','false']).optional(),sort:z.enum(['name','price','priceDesc']).default('name'),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
const reviewQuery = z.object({sort:z.enum(['newest','rating']).default('newest'),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(30).default(10)}).strict();
export async function findPublicRestaurant(id:string) {
  return Restaurant.findOne({...byId(id),isApproved:true}).lean();
}
export const listRestaurants: RequestHandler = async (req,res) => {
  const input = restaurantQuerySchema.parse(req.query);
  const filter: Record<string,unknown> = {isApproved:true};
  if (input.search) {
    const pattern = escapeRegex(input.search);
    const matchingCategories = await MenuCategory.distinct('_id',{name:{$regex:pattern,$options:'i'}}) as mongoose.Types.ObjectId[];
    const matchingItems = await MenuItem.distinct('restaurantId',{$or:[{name:{$regex:pattern,$options:'i'}},{description:{$regex:pattern,$options:'i'}},{categoryId:{$in:matchingCategories}}]});
    filter.$or = [{name:{$regex:pattern,$options:'i'}},{cuisines:{$regex:pattern,$options:'i'}},{area:{$regex:pattern,$options:'i'}},{city:{$regex:pattern,$options:'i'}},{_id:{$in:matchingItems}}];
  }
  if (input.cuisine) filter.cuisines = {$regex:`^${escapeRegex(input.cuisine)}$`,$options:'i'};
  if (input.city) filter.city = {$regex:`^${escapeRegex(input.city)}$`,$options:'i'};
  if (input.area) filter.area = {$regex:escapeRegex(input.area),$options:'i'};
  if (input.vegetarian === 'true') filter.hasVegetarianOptions = true;
  if (input.pureVegetarian === 'true') filter.isPureVegetarian = true;
  if (input.offers === 'true') filter.offer = {$exists:true,$nin:['',null]};
  if (input.openNow === 'true') filter.isOpen = true;
  if (input.lat !== undefined || input.lng !== undefined) {
    if (input.lat === undefined || input.lng === undefined) throw new ApiError(400,'VALIDATION_ERROR','Both lat and lng are required');
    filter.location = {$geoWithin:{$centerSphere:[[input.lng,input.lat],input.radiusKm/6378.1]}};
  }
  if (input.priceMax !== undefined) filter.priceForTwo = {$lte:input.priceMax};
  if (input.ratingMin !== undefined) filter.rating = {$gte:input.ratingMin};
  if (input.deliveryMax !== undefined) filter.averageDeliveryTime = {$lte:input.deliveryMax};
  const sorts:Record<string,Record<string,1|-1>> = {recommended:{rating:-1,_id:1},rating:{rating:-1,_id:1},price:{priceForTwo:1,_id:1},priceDesc:{priceForTwo:-1,_id:1},time:{averageDeliveryTime:1,_id:1},reviews:{reviewCount:-1,_id:1},name:{name:1,_id:1}};
  const sort = sorts[input.sort];
  const [rows,total] = await Promise.all([Restaurant.find(filter).sort(sort).skip((input.page-1)*input.limit).limit(input.limit).lean(),Restaurant.countDocuments(filter)]);
  res.json({data:rows.map(row=>publicRestaurant(row as unknown as Record<string,unknown>)),meta:{page:input.page,limit:input.limit,total,pages:Math.ceil(total/input.limit)}});
};
export const searchSuggestions: RequestHandler = async (req,res) => {
  const q = z.string().trim().min(2).max(80).parse(req.query.q);
  const pattern = escapeRegex(q);
  const approved=await Restaurant.find({isApproved:true}).select('_id').lean();
  const [restaurants,foods,cuisines] = await Promise.all([
    Restaurant.find({isApproved:true,name:{$regex:pattern,$options:'i'}}).select('demoId name').limit(5).lean(),
    MenuItem.find({restaurantId:{$in:approved.map(row=>row._id)},isAvailable:true,name:{$regex:pattern,$options:'i'}}).select('name restaurantId').limit(5).lean(),
    Restaurant.distinct('cuisines',{isApproved:true,cuisines:{$regex:pattern,$options:'i'}}),
  ]);
  res.json({data:{restaurants:restaurants.map(r=>({id:String(r._id),name:r.name})),foods:foods.map(i=>({id:String(i._id),restaurantId:String(i.restaurantId),name:i.name})),cuisines:cuisines.filter(c=>new RegExp(pattern,'i').test(c)).slice(0,5)}});
};
export const listCuisines:RequestHandler = async (_req,res) => {
  const rows=await Restaurant.aggregate([{$match:{isApproved:true}},{$unwind:'$cuisines'},{$group:{_id:'$cuisines',count:{$sum:1}}},{$sort:{count:-1,_id:1}}]);
  res.json({data:rows.map(row=>({name:row._id,count:row.count}))});
};
export const sitemapRestaurants:RequestHandler=async(_req,res)=>{
  const rows=await Restaurant.find({isApproved:true,isSample:{$ne:true}}).select('name updatedAt').sort({_id:1}).limit(10000).lean();
  res.setHeader('Cache-Control','public, max-age=300');res.json({data:rows.map(row=>({id:String(row._id),name:row.name,updatedAt:row.updatedAt}))});
};
export const getRestaurant: RequestHandler = async (req,res) => {
  const id = req.params.id;
  if (typeof id !== 'string') throw new ApiError(404,'NOT_FOUND','Restaurant not found');
  const row = await Restaurant.findOne({...byId(id),isApproved:true}).lean();
  if (!row) throw new ApiError(404,'NOT_FOUND','Restaurant not found');
  res.json({data:publicRestaurant(row as unknown as Record<string,unknown>)});
};
export const getMenu: RequestHandler = async (req,res) => {
  const id = req.params.id;
  if (typeof id !== 'string') throw new ApiError(404,'NOT_FOUND','Restaurant not found');
  const restaurant = await Restaurant.findOne({...byId(id),isApproved:true}).lean();
  if (!restaurant) throw new ApiError(404,'NOT_FOUND','Restaurant not found');
  const [categories,items] = await Promise.all([MenuCategory.find({restaurantId:restaurant._id}).sort({sortOrder:1}).lean(),MenuItem.find({restaurantId:restaurant._id,isAvailable:true}).sort({name:1}).lean()]);
  res.json({data:{categories:categories.map(c=>({...c,id:String(c._id)})),items:items.map(i=>({...i,id:String(i._id),restaurantId:String(restaurant._id),categoryId:String(i.categoryId)}))}});
};
export const getMenuCategories: RequestHandler = async (req,res) => {
  const row = await findPublicRestaurant(String(req.params.id));
  if (!row) throw new ApiError(404,'NOT_FOUND','Restaurant not found');
  const categories = await MenuCategory.find({restaurantId:row._id}).sort({sortOrder:1,_id:1}).lean();
  res.json({data:categories.map(c=>({...c,id:String(c._id)}))});
};
export const getMenuItems: RequestHandler = async (req,res) => {
  const input = menuQuery.parse(req.query);
  const row = await findPublicRestaurant(String(req.params.id));
  if (!row) throw new ApiError(404,'NOT_FOUND','Restaurant not found');
  const filter:Record<string,unknown> = {restaurantId:row._id,isAvailable:true};
  if (input.category) {
    const category = mongoose.isValidObjectId(input.category) ? await MenuCategory.findOne({_id:input.category,restaurantId:row._id}) : await MenuCategory.findOne({name:input.category,restaurantId:row._id});
    if (!category) throw new ApiError(404,'NOT_FOUND','Menu category not found');
    filter.categoryId = category._id;
  }
  if (input.search) filter.name = {$regex:escapeRegex(input.search),$options:'i'};
  if (input.vegetarian) filter.isVegetarian = input.vegetarian === 'true';
  if (input.popular === 'true') filter.isPopular = true;
  const sort:Record<string,1|-1> = input.sort === 'price' ? {price:1,_id:1} : input.sort === 'priceDesc' ? {price:-1,_id:1} : {name:1,_id:1};
  const [items,total] = await Promise.all([MenuItem.find(filter).sort(sort).skip((input.page-1)*input.limit).limit(input.limit).lean(),MenuItem.countDocuments(filter)]);
  res.json({data:items.map(i=>({...i,id:String(i._id),restaurantId:String(row._id),categoryId:String(i.categoryId)})),meta:{page:input.page,limit:input.limit,total,pages:Math.ceil(total/input.limit)}});
};
export const listReviews: RequestHandler = async (req,res) => {
  const input = reviewQuery.parse(req.query);
  const row = await findPublicRestaurant(String(req.params.id));
  if (!row) throw new ApiError(404,'NOT_FOUND','Restaurant not found');
  const filter = {restaurantId:row._id,isHidden:{$ne:true}};
  const sort:Record<string,1|-1> = input.sort === 'rating' ? {rating:-1,createdAt:-1,_id:1} : {createdAt:-1,_id:1};
  const [reviews,total] = await Promise.all([Review.find(filter).populate('userId','name').sort(sort).skip((input.page-1)*input.limit).limit(input.limit).lean(),Review.countDocuments(filter)]);
  res.json({data:reviews.map(r=>({...r,id:String(r._id),userId:String((r.userId as unknown as {_id:unknown})?._id),userName:(r.userId as unknown as {name?:string})?.name || 'FoodieGo user'})),meta:{page:input.page,limit:input.limit,total,pages:Math.ceil(total/input.limit)}});
};
