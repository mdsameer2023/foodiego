import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import supertest from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import type { Env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Restaurant } from '../src/models/Restaurant.js';
import { MenuCategory } from '../src/models/MenuCategory.js';
import { MenuItem } from '../src/models/MenuItem.js';

const env: Env = {NODE_ENV:'test',PORT:5000,MONGODB_URI:'',JWT_ACCESS_SECRET:'access-test-secret-longer-than-thirty-two-chars',JWT_REFRESH_SECRET:'refresh-test-secret-longer-than-thirty-two-chars',FRONTEND_URL:'http://localhost:3000',BACKEND_URL:'http://localhost:5000',EMAIL_MODE:'console',TRACKING_MIN_INTERVAL_MS:5000,TRACKING_MIN_DISTANCE_METERS:30,TRACKING_STATIONARY_INTERVAL_MS:30000};
let mongo: MongoMemoryServer;
let request: ReturnType<typeof supertest>;
before(async()=>{
  mongo=await MongoMemoryServer.create({instance:{launchTimeout:60000}});
  await connectDatabase(mongo.getUri(),'foodiego_test');
  request=supertest(createApp(env));
});
after(async()=>{await disconnectDatabase();await mongo?.stop();});
async function agent() {
  const client=supertest.agent(createApp(env));
  const csrf=await client.get('/api/auth/csrf').expect(200);
  return {client,token:csrf.body.data.csrfToken as string};
}
const userData={name:'Test Customer',email:'test@example.com',password:'GoodPassword123'};

test('registration, login, logout, duplicate email, role escalation and protected profile',async()=>{
  const a=await agent();
  await a.client.get('/api/users/profile').expect(401);
  await a.client.post('/api/auth/register').set('X-CSRF-Token',a.token).send({...userData,role:'ADMIN'}).expect(400);
  const registered=await a.client.post('/api/auth/register').set('X-CSRF-Token',a.token).send(userData).expect(201);
  assert.equal(registered.body.data.user.role,'CUSTOMER');
  assert.equal(registered.body.data.user.passwordHash,undefined);
  assert.equal((await User.findOne({email:userData.email}))?.role,'CUSTOMER');
  await a.client.get('/api/auth/me').expect(200);
  await a.client.post('/api/auth/logout').set('X-CSRF-Token',a.token).expect(200);
  await a.client.get('/api/auth/me').expect(401);
  await a.client.post('/api/auth/register').set('X-CSRF-Token',a.token).send(userData).expect(409);
  await a.client.post('/api/auth/login').set('X-CSRF-Token',a.token).send({email:userData.email,password:'wrong'}).expect(401);
  await a.client.post('/api/auth/login').set('X-CSRF-Token',a.token).send({email:userData.email,password:userData.password}).expect(200);
  const profile=await a.client.patch('/api/users/profile').set('X-CSRF-Token',a.token).send({name:'Updated Customer',phone:'9876543210'}).expect(200);
  assert.equal(profile.body.data.user.name,'Updated Customer');
  assert.equal((await a.client.get('/api/users/profile')).body.data.user.phone,'9876543210');
  await a.client.patch('/api/users/profile').send({name:'CSRF bypass'}).expect(403);
});

test('refresh rotation invalidates old refresh token',async()=>{
  const a=await agent();
  const login=await a.client.post('/api/auth/login').set('X-CSRF-Token',a.token).send({email:userData.email,password:userData.password}).expect(200);
  const oldCookie=(login.headers['set-cookie'] as unknown as string[]).find(c=>c.startsWith('fg_refresh='))!;
  await a.client.post('/api/auth/refresh').set('X-CSRF-Token',a.token).expect(200);
  await request.post('/api/auth/refresh').set('Cookie',[oldCookie.split(';')[0]!,`fg_csrf=${a.token}`]).set('X-CSRF-Token',a.token).expect(401);
});

test('anonymous refresh attempts do not block registration',async()=>{
  const a=await agent();
  for(let attempt=0;attempt<10;attempt++)await a.client.post('/api/auth/refresh').set('X-CSRF-Token',a.token).expect(401);
  await a.client.post('/api/auth/refresh').set('X-CSRF-Token',a.token).expect(429);
  await a.client.post('/api/auth/register').set('X-CSRF-Token',a.token).send({name:'New Customer',email:'after-refresh@example.com',password:'GoodPassword123'}).expect(201);
});

test('addresses are isolated by owner',async()=>{
  const owner=await agent();const other=await agent();
  await owner.client.post('/api/auth/login').set('X-CSRF-Token',owner.token).send({email:userData.email,password:userData.password}).expect(200);
  await other.client.post('/api/auth/register').set('X-CSRF-Token',other.token).send({name:'Other User',email:'other@example.com',password:'GoodPassword123'}).expect(201);
  const created=await owner.client.post('/api/users/addresses').set('X-CSRF-Token',owner.token).send({fullName:'Test Customer',phone:'9876543210',addressLine1:'12 Park Street',city:'Kolkata',state:'West Bengal',postalCode:'700016',addressType:'HOME'}).expect(201);
  const id=created.body.data.id;
  assert.equal((await owner.client.get('/api/users/addresses').expect(200)).body.data.length,1);
  assert.equal((await other.client.get('/api/users/addresses').expect(200)).body.data.length,0);
  await other.client.patch(`/api/users/addresses/${id}`).set('X-CSRF-Token',other.token).send({city:'Delhi'}).expect(404);
  await other.client.delete(`/api/users/addresses/${id}`).set('X-CSRF-Token',other.token).expect(404);
  await owner.client.patch(`/api/users/addresses/${id}`).set('X-CSRF-Token',owner.token).send({landmark:'Near metro'}).expect(200);
  await owner.client.delete(`/api/users/addresses/${id}`).set('X-CSRF-Token',owner.token).expect(200);
});

test('public restaurant search, filters, menu, and approved-only visibility',async()=>{
  const approved=await Restaurant.create({name:'Bengal Kitchen',description:'Local Bengali meals',cuisines:['Bengali'],address:'Park Street',city:'Kolkata',area:'Park Street',rating:4.7,priceForTwo:500,averageDeliveryTime:25,isApproved:true,hasVegetarianOptions:true});
  await Restaurant.create({name:'Hidden Kitchen',description:'Not approved',cuisines:['Indian'],address:'Park Street',city:'Kolkata',area:'Park Street',rating:5,priceForTwo:300,isApproved:false});
  const category=await MenuCategory.create({restaurantId:approved._id,name:'Recommended',sortOrder:0});
  await MenuItem.create({restaurantId:approved._id,categoryId:category._id,name:'Paneer Roll',price:150,isVegetarian:true});
  const results=await request.get('/api/restaurants?search=Bengal&city=Kolkata&vegetarian=true&priceMax=600&ratingMin=4.5&deliveryMax=30').expect(200);
  assert.equal(results.body.meta.total,1);
  assert.equal(results.body.data[0].name,'Bengal Kitchen');
  assert.equal((await request.get('/api/restaurants?search=Hidden').expect(200)).body.meta.total,0);
  assert.equal((await request.get(`/api/restaurants/${approved.id}/menu`).expect(200)).body.data.items.length,1);
});

test('database startup failure rejects rather than accepting traffic',async()=>{
  await disconnectDatabase();
  await assert.rejects(connectDatabase('mongodb://127.0.0.1:1/foodiego_test'));
  await connectDatabase(mongo.getUri(),'foodiego_test');
});
