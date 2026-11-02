import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { loadEnv } from '../src/config/env.js';
import { Restaurant } from '../src/models/Restaurant.js';
import { MenuCategory } from '../src/models/MenuCategory.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { Review } from '../src/models/Review.js';
import { User } from '../src/models/User.js';
import { Coupon } from '../src/models/Coupon.js';

type SeedRestaurant = {id:string;name:string;cuisine:string;image:string;rating:number;reviews:number;minutes:number;price:number;veg:boolean;offer:string;area:string};
type SeedItem = {id:string;restaurantId:string;name:string;description:string;price:number;image:string;veg:boolean;category:string};
const additions = [
  {name:'Dosa Day',cuisine:'South Indian',image:'/images/south-indian.jpg',previousImage:'/images/indian.jpg',dishes:['Masala Dosa','Idli Sambar','Uttapam','Medu Vada','Pongal','Filter Coffee']},
  {name:'Steam Basket',cuisine:'Momos',image:'/images/momos.jpg',previousImage:'/images/noodles.jpg',dishes:['Veg Momos','Chicken Momos','Chilli Momos','Paneer Momos','Fried Momos','Momo Platter']},
  {name:'Roll Republic',cuisine:'Rolls',image:'/images/rolls.jpg',previousImage:'/images/burger.jpg',dishes:['Egg Roll','Paneer Roll','Chicken Roll','Veg Roll','Double Egg Roll','Spicy Roll']},
  {name:'Bread & Bite',cuisine:'Sandwiches',image:'/images/sandwiches.jpg',previousImage:'/images/salad.jpg',dishes:['Grilled Cheese','Club Sandwich','Veg Sandwich','Chicken Sandwich','Paneer Melt','Garden Sandwich']},
  {name:'Scoop Story',cuisine:'Ice Cream',image:'/images/ice-cream.jpg',previousImage:'/images/dessert.jpg',dishes:['Vanilla Scoop','Chocolate Scoop','Mango Sundae','Strawberry Cup','Brownie Sundae','Cookie Sundae']},
  {name:'Fresh Fuel',cuisine:'Healthy Food',image:'/images/salad.jpg',previousImage:'/images/salad.jpg',dishes:['Quinoa Bowl','Protein Salad','Fruit Bowl','Green Wrap','Hummus Plate','Overnight Oats']},
];
async function main() {
  const env = loadEnv();
  const file = path.resolve(process.cwd(),'seed/catalog.json');
  const catalog = JSON.parse(await fs.readFile(file,'utf8')) as {restaurants:SeedRestaurant[];menu:SeedItem[]};
  const restaurants=[...catalog.restaurants,...additions.map((entry,index)=>({id:`phase3-${index+1}`,name:entry.name,cuisine:entry.cuisine,image:entry.image,rating:0,reviews:0,minutes:20+index*3,price:300+index*40,veg:!['Momos','Rolls','Sandwiches'].includes(entry.cuisine),offer:'',area:'Park Street'}))];
  const menu=[...catalog.menu,...additions.flatMap((entry,index)=>entry.dishes.map((name,dish)=>({id:`phase3-${index+1}-${dish}`,restaurantId:`phase3-${index+1}`,name,description:`Sample ${name} from ${entry.name}.`,price:120+dish*35,image:entry.image,veg:!['Chicken Momos','Chicken Roll','Chicken Sandwich','Egg Roll','Double Egg Roll'].includes(name),category:dish<4?'Recommended':'Sides & treats'})))];
  await connectDatabase(env.MONGODB_URI);
  const reviewers=[];
  for (const [index,name] of ['FoodieGo Demo Guest','FoodieGo Sample Guest'].entries()) {
    const email=`foodiego-sample-reviewer-${index+1}@example.invalid`;
    let user=await User.findOne({email});
    if (!user) user=await User.create({name,email,passwordHash:await bcrypt.hash(crypto.randomBytes(32).toString('hex'),12),role:'CUSTOMER',isActive:false});
    if (user.isActive) throw new Error('A sample reviewer email belongs to an active user; seeding stopped');
    reviewers.push(user);
  }
  let insertedRestaurants=0,insertedItems=0;
  for (const [index,r] of restaurants.entries()) {
    let restaurant=await Restaurant.findOne({demoId:r.id});
    if (restaurant && !restaurant.isSample) continue;
    if (!restaurant) {
      const lon=88.3639+(index%6)*0.008; const lat=22.5726+Math.floor(index/6)*0.008;
      restaurant=await Restaurant.create({demoId:r.id,name:r.name,description:`Sample ${r.cuisine} restaurant for the FoodieGo demonstration.`,cuisines:[r.cuisine],address:r.area,city:'Kolkata',area:r.area,location:{type:'Point',coordinates:[lon,lat]},images:[`${env.FRONTEND_URL}${r.image}`],rating:0,reviewCount:0,averageDeliveryTime:r.minutes,priceForTwo:r.price,openingHours:'11:00–23:00',isOpen:true,isApproved:true,hasVegetarianOptions:menu.some(i=>i.restaurantId===r.id&&i.veg),isPureVegetarian:r.veg,isSample:true,offer:r.offer});
      insertedRestaurants++;
    }
    const addition=additions[index-catalog.restaurants.length];
    if (addition && addition.previousImage!==addition.image && restaurant.images[0]===`${env.FRONTEND_URL}${addition.previousImage}`) {
      await Restaurant.updateOne({_id:restaurant._id,isSample:true,images:`${env.FRONTEND_URL}${addition.previousImage}`},{$set:{images:[`${env.FRONTEND_URL}${addition.image}`]}});
    }
    for (const [sortOrder,name] of ['Recommended','Sides & treats'].entries()) {
      let category=await MenuCategory.findOne({restaurantId:restaurant._id,name});
      if (!category) category=await MenuCategory.create({restaurantId:restaurant._id,name,sortOrder});
      for (const i of menu.filter(item=>item.restaurantId===r.id&&item.category===name)) {
        const existing=await MenuItem.findOne({demoId:i.id});
        if (existing) {
          if (addition && addition.previousImage!==addition.image && existing.isSample && existing.image===`${env.FRONTEND_URL}${addition.previousImage}`) {
            await MenuItem.updateOne({_id:existing._id,isSample:true,image:`${env.FRONTEND_URL}${addition.previousImage}`},{$set:{image:`${env.FRONTEND_URL}${addition.image}`}});
          }
          continue;
        }
        await MenuItem.create({demoId:i.id,restaurantId:restaurant._id,categoryId:category._id,name:i.name,description:i.description,price:i.price,image:`${env.FRONTEND_URL}${i.image}`,isVegetarian:i.veg,isAvailable:true,isPopular:i.id.endsWith('-0'),isSample:true,customizationOptions:[{name:'Portion',options:[{name:'Regular',price:0},{name:'Extra portion',price:60}]}]});
        insertedItems++;
      }
    }
    for (const [n,user] of reviewers.entries()) {
      await Review.updateOne({userId:user._id,restaurantId:restaurant._id},{$setOnInsert:{userId:user._id,restaurantId:restaurant._id,rating:n?4:5,comment:n?'Sample review: tasty food and good value.':'Sample review: a satisfying meal.'}},{upsert:true});
    }
    const [stats]=await Review.aggregate([{$match:{restaurantId:restaurant._id}},{$group:{_id:'$restaurantId',rating:{$avg:'$rating'},reviewCount:{$sum:1}}}]);
    await Restaurant.updateOne({_id:restaurant._id},{$set:{rating:Math.round(stats.rating*10)/10,reviewCount:stats.reviewCount}});
  }
  const now=Date.now();
  for (const entry of [
    {code:'FOODIE50',description:'Development sample: 50% off up to ₹100',discountType:'PERCENT',discountValue:50,maxDiscountPaise:10000,minimumOrderPaise:19900},
    {code:'SAVE100',description:'Development sample: ₹100 off orders above ₹499',discountType:'FIXED',discountValue:10000,maxDiscountPaise:0,minimumOrderPaise:49900},
    {code:'WELCOME20',description:'Development sample: 20% off up to ₹80',discountType:'PERCENT',discountValue:20,maxDiscountPaise:8000,minimumOrderPaise:19900},
  ]) await Coupon.updateOne({code:entry.code},{$setOnInsert:{...entry,usageLimit:1000,perUserLimit:1,usageCount:0,validFrom:new Date(now-86_400_000),expiresAt:new Date(now+90*86_400_000),applicableRestaurantIds:[],isActive:true,isSample:true}},{upsert:true});
  console.log(`Demo catalog ready: ${restaurants.length} restaurants and ${menu.length} menu items; inserted ${insertedRestaurants} restaurants and ${insertedItems} items.`);
  await disconnectDatabase();
}
main().catch(error=>{console.error('Seed failed:',error instanceof Error?error.message:'unknown error');process.exitCode=1;void disconnectDatabase();});
