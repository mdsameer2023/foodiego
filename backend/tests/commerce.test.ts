import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { before,after,test } from 'node:test';
import supertest from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectDatabase,disconnectDatabase } from '../src/config/database.js';
import type { Env } from '../src/config/env.js';
import { Restaurant } from '../src/models/Restaurant.js';
import { MenuCategory } from '../src/models/MenuCategory.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { Coupon } from '../src/models/Coupon.js';
import { Cart } from '../src/models/Cart.js';
import { Order } from '../src/models/Order.js';
import { User } from '../src/models/User.js';

const env:Env={NODE_ENV:'test',PORT:5000,MONGODB_URI:'',JWT_ACCESS_SECRET:'access-test-secret-longer-than-thirty-two-chars',JWT_REFRESH_SECRET:'refresh-test-secret-longer-than-thirty-two-chars',FRONTEND_URL:'http://localhost:3000',BACKEND_URL:'http://localhost:5000',EMAIL_MODE:'console',TRACKING_MIN_INTERVAL_MS:5000,TRACKING_MIN_DISTANCE_METERS:30,TRACKING_STATIONARY_INTERVAL_MS:30000};
const app=createApp(env);let mongo:MongoMemoryReplSet;let itemId:string;let otherItemId:string;
before(async()=>{
  mongo=await MongoMemoryReplSet.create({replSet:{count:1},instanceOpts:[{launchTimeout:60000}]});
  await connectDatabase(mongo.getUri(),'foodiego_commerce_test');
  const restaurant=await Restaurant.create({name:'Test Kitchen',description:'Test food',cuisines:['Indian'],address:'Park Street',city:'Kolkata',area:'Park Street',priceForTwo:400,isApproved:true,isOpen:true,images:['/images/biryani.jpg'],deliveryFeePaise:3500,packagingFeePaise:1000,taxRateBasisPoints:0,codEnabled:true});
  const other=await Restaurant.create({name:'Other Kitchen',description:'Other food',cuisines:['Pizza'],address:'Park Street',city:'Kolkata',area:'Park Street',priceForTwo:400,isApproved:true,isOpen:true});
  const first=await MenuCategory.create({restaurantId:restaurant._id,name:'Main'});const second=await MenuCategory.create({restaurantId:other._id,name:'Main'});
  const item=await MenuItem.create({restaurantId:restaurant._id,categoryId:first._id,name:'Biryani',price:200,isVegetarian:false,isAvailable:true,customizationOptions:[{name:'Portion',required:true,minSelections:1,maxSelections:1,options:[{name:'Half',price:0},{name:'Full',price:50}]}]});
  const otherItem=await MenuItem.create({restaurantId:other._id,categoryId:second._id,name:'Pizza',price:300,isVegetarian:true,isAvailable:true});
  itemId=String(item._id);otherItemId=String(otherItem._id);
  const now=Date.now();await Coupon.create({code:'TEST50',description:'Test coupon',discountType:'PERCENT',discountValue:50,maxDiscountPaise:10000,minimumOrderPaise:10000,usageLimit:1,perUserLimit:1,usageCount:0,validFrom:new Date(now-60_000),expiresAt:new Date(now+86_400_000),isActive:true});
});
after(async()=>{await disconnectDatabase();await mongo?.stop();});
async function user(email:string){const client=supertest.agent(app);const token=(await client.get('/api/auth/csrf').expect(200)).body.data.csrfToken as string;await client.post('/api/auth/register').set('X-CSRF-Token',token).send({name:'Cart Tester',email,password:'GoodPassword123'}).expect(201);const address=(await client.post('/api/users/addresses').set('X-CSRF-Token',token).send({fullName:'Cart Tester',phone:'9999999999',addressLine1:'12 Park Street',city:'Kolkata',state:'West Bengal',postalCode:'700016',addressType:'HOME',isDefault:true}).expect(201)).body.data.id as string;return {client,token,address};}
test('cart is private, enforces customizations, quantities and one restaurant',async()=>{
  await supertest(app).get('/api/cart').expect(401);
  const one=await user('cart-one@example.com');const two=await user('cart-two@example.com');
  const post=()=>one.client.post('/api/cart/items').set('X-CSRF-Token',one.token);
  await post().send({menuItemId:itemId,quantity:1,selections:[]}).expect(400);
  await post().send({menuItemId:itemId,quantity:21,selections:[{group:'Portion',options:['Half']}]}).expect(400);
  await post().send({menuItemId:itemId,quantity:1,selections:[{group:'Portion',options:['Unknown']}]}).expect(400);
  const first=await post().send({menuItemId:itemId,quantity:2,selections:[{group:'Portion',options:['Full']}]}).expect(201);
  const key=first.body.data.items[0].key as string;
  assert.equal(first.body.data.pricing.totalPaise,2*25000+3500+1000);
  await post().send({menuItemId:otherItemId,quantity:1}).expect(409);
  assert.equal((await two.client.get('/api/cart').expect(200)).body.data.items.length,0);
  const updated=await one.client.patch(`/api/cart/items/${key}`).set('X-CSRF-Token',one.token).send({quantity:3}).expect(200);
  assert.equal(updated.body.data.items[0].quantity,3);
  const decreased=await one.client.patch(`/api/cart/items/${key}`).set('X-CSRF-Token',one.token).send({quantity:1}).expect(200);
  assert.equal(decreased.body.data.items[0].quantity,1);
  await one.client.delete(`/api/cart/items/${key}`).set('X-CSRF-Token',one.token).expect(200);
  assert.equal((await one.client.get('/api/cart').expect(200)).body.data.items.length,0);
});
test('expired, minimum and restaurant-restricted coupons are rejected',async()=>{
  const account=await user('coupon-rules@example.com');
  await account.client.post('/api/cart/items').set('X-CSRF-Token',account.token).send({menuItemId:itemId,quantity:1,selections:[{group:'Portion',options:['Half']}]}).expect(201);
  const now=Date.now();const other=await Restaurant.findOne({name:'Other Kitchen'});
  await Coupon.create([
    {code:'EXPIRED',description:'Expired',discountType:'FIXED',discountValue:1000,validFrom:new Date(now-86_400_000),expiresAt:new Date(now-1000),isActive:true},
    {code:'MINIMUM',description:'High minimum',discountType:'FIXED',discountValue:1000,minimumOrderPaise:50000,validFrom:new Date(now-1000),expiresAt:new Date(now+86_400_000),isActive:true},
    {code:'RESTRICTED',description:'Other restaurant',discountType:'FIXED',discountValue:1000,applicableRestaurantIds:[other!._id],validFrom:new Date(now-1000),expiresAt:new Date(now+86_400_000),isActive:true},
  ]);
  for(const code of ['EXPIRED','MINIMUM','RESTRICTED'])await account.client.post('/api/coupons/validate').set('X-CSRF-Token',account.token).send({code}).expect(400);
  const available=(await account.client.get('/api/coupons/available').expect(200)).body.data as Array<{code:string}>;
  for(const code of ['EXPIRED','MINIMUM','RESTRICTED'])assert.equal(available.some(row=>row.code===code),false);
});
test('checkout uses database prices, validates ownership and places idempotent COD order',async()=>{
  const one=await user('order-one@example.com');const two=await user('order-two@example.com');
  await one.client.post('/api/cart/items').set('X-CSRF-Token',one.token).send({menuItemId:itemId,quantity:2,selections:[{group:'Portion',options:['Half']}],price:1}).expect(400);
  await one.client.post('/api/cart/items').set('X-CSRF-Token',one.token).send({menuItemId:itemId,quantity:2,selections:[{group:'Portion',options:['Half']}]}).expect(201);
  const quote=await one.client.post('/api/checkout/quote').set('X-CSRF-Token',one.token).send({code:'TEST50',addressId:one.address}).expect(200);
  assert.equal(quote.body.data.pricing.subtotalPaise,40000);
  assert.equal(quote.body.data.pricing.discountPaise,10000);
  await one.client.post('/api/checkout/quote').set('X-CSRF-Token',one.token).send({addressId:two.address}).expect(404);
  const key=crypto.randomUUID();
  const placed=await one.client.post('/api/orders').set('X-CSRF-Token',one.token).send({addressId:one.address,code:'TEST50',paymentMethod:'COD',deliveryInstructions:'Ring the bell',idempotencyKey:key}).expect(201);
  assert.equal(placed.body.data.pricingBreakdown.totalPaise,34500);
  const id=placed.body.data.id as string;
  assert.equal((await one.client.get('/api/cart').expect(200)).body.data.items.length,0);
  assert.equal((await one.client.post('/api/orders').set('X-CSRF-Token',one.token).send({addressId:one.address,code:'TEST50',paymentMethod:'COD',idempotencyKey:key}).expect(200)).body.data.id,id);
  await two.client.get(`/api/orders/${id}`).expect(404);
  assert.equal((await one.client.get('/api/orders').expect(200)).body.meta.total,1);
  await two.client.patch(`/api/orders/${id}/status`).set('X-CSRF-Token',two.token).send({status:'CONFIRMED'}).expect(403);
  const cancelled=await one.client.post(`/api/orders/${id}/cancel`).set('X-CSRF-Token',one.token).send({reason:'No longer needed'}).expect(200);
  assert.equal(cancelled.body.data.orderStatus,'CANCELLED');
  await one.client.post(`/api/orders/${id}/cancel`).set('X-CSRF-Token',one.token).send({reason:'No longer needed'}).expect(200);
  assert.equal(await Order.countDocuments({userId:placed.body.data.userId}),1);
  assert.equal((await Coupon.findOne({code:'TEST50'}))?.usageCount,1);
  await MenuItem.updateOne({_id:itemId},{$set:{price:250}});
  const reordered=await one.client.post(`/api/orders/${id}/reorder`).set('X-CSRF-Token',one.token).send({replaceExisting:false}).expect(200);
  assert.equal(reordered.body.data.cart.items.length,1);
  assert.equal(reordered.body.data.priceChanges[0].nowPaise,25000);
  await one.client.post('/api/coupons/validate').set('X-CSRF-Token',one.token).send({code:'TEST50'}).expect(400);
  await MenuItem.updateOne({_id:itemId},{$set:{isAvailable:false}});
  await one.client.post(`/api/orders/${id}/reorder`).set('X-CSRF-Token',one.token).send({replaceExisting:true}).expect(409);
  assert.equal((await Cart.findOne({userId:placed.body.data.userId}))?.items.length,1);
  await MenuItem.updateOne({_id:itemId},{$set:{isAvailable:true,price:200}});
});
test('concurrent coupon redemption cannot exceed limit and failed order keeps cart',async()=>{
  const now=Date.now();await Coupon.create({code:'RACE50',description:'Concurrency test',discountType:'FIXED',discountValue:5000,minimumOrderPaise:10000,usageLimit:1,perUserLimit:1,validFrom:new Date(now-60_000),expiresAt:new Date(now+60_000),isActive:true});
  const first=await user('race-one@example.com');const second=await user('race-two@example.com');
  for(const account of [first,second])await account.client.post('/api/cart/items').set('X-CSRF-Token',account.token).send({menuItemId:itemId,quantity:1,selections:[{group:'Portion',options:['Half']}]}).expect(201);
  const requests=[first,second].map(account=>account.client.post('/api/orders').set('X-CSRF-Token',account.token).send({addressId:account.address,code:'RACE50',paymentMethod:'COD',idempotencyKey:crypto.randomUUID()}));
  const outcomes=await Promise.all(requests);
  assert.equal(outcomes.filter(response=>response.status===201).length,1);
  assert.equal((await Coupon.findOne({code:'RACE50'}))?.usageCount,1);
  const loser=outcomes[0]?.status===201?second:first;
  assert.equal((await loser.client.get('/api/cart').expect(200)).body.data.items.length,1);
});
test('status transitions require staff role and follow the state machine',async()=>{
  const customer=await user('status-customer@example.com');const staff=await user('status-admin@example.com');const partner=await user('status-partner@example.com');
  await User.updateOne({email:'status-admin@example.com'},{$set:{role:'ADMIN'}});
  await User.updateOne({email:'status-partner@example.com'},{$set:{role:'DELIVERY_PARTNER'}});
  await customer.client.post('/api/cart/items').set('X-CSRF-Token',customer.token).send({menuItemId:itemId,quantity:1,selections:[{group:'Portion',options:['Half']}]}).expect(201);
  const placed=await customer.client.post('/api/orders').set('X-CSRF-Token',customer.token).send({addressId:customer.address,paymentMethod:'COD',idempotencyKey:crypto.randomUUID()}).expect(201);
  const orderId=placed.body.data.id as string;
  await customer.client.patch(`/api/orders/${orderId}/status`).set('X-CSRF-Token',customer.token).send({status:'CONFIRMED'}).expect(403);
  await staff.client.patch(`/api/orders/${orderId}/status`).set('X-CSRF-Token',staff.token).send({status:'PREPARING'}).expect(409);
  const confirmed=await staff.client.patch(`/api/orders/${orderId}/status`).set('X-CSRF-Token',staff.token).send({status:'CONFIRMED'}).expect(200);
  assert.equal(confirmed.body.data.statusHistory.length,2);
  await staff.client.patch(`/api/orders/${orderId}/status`).set('X-CSRF-Token',staff.token).send({status:'PREPARING'}).expect(200);
  await customer.client.post(`/api/orders/${orderId}/cancel`).set('X-CSRF-Token',customer.token).send({reason:'Too late'}).expect(409);
  const partnerId=String((await User.findOne({email:'status-partner@example.com'}))?._id);
  await customer.client.patch(`/api/orders/${orderId}/assign-partner`).set('X-CSRF-Token',customer.token).send({partnerId}).expect(403);
  await partner.client.patch(`/api/orders/${orderId}/status`).set('X-CSRF-Token',partner.token).send({status:'READY_FOR_PICKUP'}).expect(403);
  const assigned=await staff.client.patch(`/api/orders/${orderId}/assign-partner`).set('X-CSRF-Token',staff.token).send({partnerId}).expect(200);
  assert.equal(assigned.body.data.assignmentHistory.length,1);
  await staff.client.patch(`/api/orders/${orderId}/status`).set('X-CSRF-Token',staff.token).send({status:'READY_FOR_PICKUP'}).expect(200);
  await partner.client.patch(`/api/orders/${orderId}/status`).set('X-CSRF-Token',partner.token).send({status:'PICKED_UP'}).expect(200);
});
