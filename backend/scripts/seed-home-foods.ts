import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { loadEnv } from '../src/config/env.js';
import { Restaurant } from '../src/models/Restaurant.js';
import { MenuCategory } from '../src/models/MenuCategory.js';
import { MenuItem } from '../src/models/MenuItem.js';

// Add only the dishes advertised by the lower home row; preserve existing records.
const dishes = [
  {key:'pasta',name:'Creamy Pesto Pasta',cuisine:'Pizza',price:249},
  {key:'fries',name:'French Fries',cuisine:'Burgers',price:129},
  {key:'pancakes',name:'Maple Pancakes',cuisine:'Desserts',price:199},
  {key:'coffee',name:'Coffee',cuisine:'South Indian',price:99},
];
try {
  await connectDatabase(loadEnv().MONGODB_URI);
  for (const dish of dishes) {
    const restaurant = await Restaurant.findOne({isSample:true,isApproved:true,cuisines:dish.cuisine}).sort({demoId:1});
    if (!restaurant) throw new Error(`No sample restaurant for ${dish.cuisine}`);
    const category = await MenuCategory.findOneAndUpdate({restaurantId:restaurant._id,name:'Recommended'},{$setOnInsert:{sortOrder:0}},{upsert:true,returnDocument:'after'});
    await MenuItem.updateOne({demoId:`home-food-${dish.key}`},{$setOnInsert:{restaurantId:restaurant._id,categoryId:category._id,name:dish.name,description:`Sample ${dish.name}. Freshly prepared to order.`,price:dish.price,image:`/images/${dish.key}.jpg`,isVegetarian:true,isAvailable:true,isSample:true}},{upsert:true,runValidators:true});
    console.log(`${dish.name}: ready`);
  }
} finally {
  await disconnectDatabase();
}
