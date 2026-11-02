import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase,disconnectDatabase } from '../src/config/database.js';
import { loadEnv } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Cart } from '../src/models/Cart.js';
import { Order } from '../src/models/Order.js';
import { Address } from '../src/models/Address.js';
import { Coupon } from '../src/models/Coupon.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { Favorite } from '../src/models/Favorite.js';
import { Review } from '../src/models/Review.js';

const email=process.argv[2];
if (!email || !/^phase4-e2e-[a-f\d-]+@example\.invalid$/.test(email)) throw new Error('Only a specific Phase 4 test email may be cleaned');
const env=loadEnv();await connectDatabase(env.MONGODB_URI);
try {
  const user=await User.findOne({email});
  if (!user) {console.log('No test records found.');process.exitCode=0;}
  else {
    const session=await mongoose.startSession();
    try {await session.withTransaction(async()=>{
      const orders=await Order.find({userId:user._id}).select('couponSnapshot').session(session).lean();
      for (const code of new Set(orders.map(order=>order.couponSnapshot?.code).filter((value):value is string=>typeof value==='string'))) {
        const count=orders.filter(order=>order.couponSnapshot?.code===code).length;
        await Coupon.updateOne({code,usageCount:{$gte:count}},{$inc:{usageCount:-count}},{session});
      }
      await Order.deleteMany({userId:user._id},{session});
      await Cart.deleteMany({userId:user._id},{session});
      await Address.deleteMany({userId:user._id},{session});
      await RefreshSession.deleteMany({userId:user._id},{session});
      await Favorite.deleteMany({userId:user._id},{session});
      await Review.deleteMany({userId:user._id},{session});
      await User.deleteOne({_id:user._id,email},{session});
    });console.log('Phase 4 test account and its records removed.');}
    finally {await session.endSession();}
  }
} finally {await disconnectDatabase();}
