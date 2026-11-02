import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { before,after,test } from 'node:test';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import WebSocket from 'ws';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectDatabase,disconnectDatabase } from '../src/config/database.js';
import type { Env } from '../src/config/env.js';
import type { PaymentGateway,GatewayPayment,GatewayRefund } from '../src/services/payment-gateway.js';
import { Restaurant } from '../src/models/Restaurant.js';
import { MenuCategory } from '../src/models/MenuCategory.js';
import { MenuItem } from '../src/models/MenuItem.js';
import { User } from '../src/models/User.js';
import { Payment } from '../src/models/Payment.js';
import { Order } from '../src/models/Order.js';
import { DeliveryPartner } from '../src/models/DeliveryPartner.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { attachRealtime } from '../src/services/realtime.js';

const env:Env={NODE_ENV:'test',PORT:5000,MONGODB_URI:'',JWT_ACCESS_SECRET:'phase5-access-secret-longer-than-thirty-two',JWT_REFRESH_SECRET:'phase5-refresh-secret-longer-than-thirty-two',FRONTEND_URL:'http://localhost:3000',BACKEND_URL:'http://localhost:5000',EMAIL_MODE:'disabled',RAZORPAY_KEY_ID:'rzp_test_fake',RAZORPAY_KEY_SECRET:'phase5-fake-secret',RAZORPAY_WEBHOOK_SECRET:'phase5-fake-webhook',TRACKING_MIN_INTERVAL_MS:5000,TRACKING_MIN_DISTANCE_METERS:30,TRACKING_STATIONARY_INTERVAL_MS:30000};
const payments=new Map<string,GatewayPayment>();const remoteRefunds=new Map<string,GatewayRefund>();let sequence=0,refundResponseLost=false;
const gateway:PaymentGateway={
  async createOrder({amount}){return{id:`order_test_${++sequence}`,amount,currency:'INR'};},
  async fetchPayment(id){const value=payments.get(id);if(!value)throw new Error('Payment not found');return value;},
  async fetchOrderPayments(id){return [...payments.values()].filter(payment=>payment.order_id===id);},
  async refundPayment(id,{amount,receipt}){const remote={id:`rfnd_test_${++sequence}`,payment_id:id,amount,status:'processed',receipt};remoteRefunds.set(remote.id,remote);if(refundResponseLost){refundResponseLost=false;throw new Error('Provider response lost');}return remote;},
  async fetchRefund(id):Promise<GatewayRefund>{const value=remoteRefunds.get(id);if(!value)throw new Error('Refund not found');return value;},
  async fetchPaymentRefunds(id):Promise<GatewayRefund[]>{return [...remoteRefunds.values()].filter(row=>row.payment_id===id);},
};
const app=createApp(env,{paymentGateway:gateway});let mongo:MongoMemoryReplSet;let itemId:string;
before(async()=>{
  mongo=await MongoMemoryReplSet.create({replSet:{count:1},instanceOpts:[{launchTimeout:60000}]});
  await connectDatabase(mongo.getUri(),'foodiego_phase5_test');
  const restaurant=await Restaurant.create({name:'Payment Kitchen',description:'Test food',cuisines:['Indian'],address:'Park Street',city:'Kolkata',area:'Park Street',priceForTwo:400,isApproved:true,isOpen:true,codEnabled:true});
  const category=await MenuCategory.create({restaurantId:restaurant._id,name:'Main'});
  itemId=String((await MenuItem.create({restaurantId:restaurant._id,categoryId:category._id,name:'Biryani',price:200,isVegetarian:false,isAvailable:true}))._id);
});
after(async()=>{await disconnectDatabase();await mongo?.stop();});
async function account(email:string){
  const client=supertest.agent(app);const csrf=(await client.get('/api/auth/csrf').expect(200)).body.data.csrfToken as string;
  await client.post('/api/auth/register').set('X-CSRF-Token',csrf).send({name:'Phase Five User',email,password:'GoodPassword123'}).expect(201);
  return {client,csrf};
}
test('online payment validates signature, provider status and webhook replay before clearing cart',async()=>{
  const user=await account('phase5-customer@example.com');
  const address=(await user.client.post('/api/users/addresses').set('X-CSRF-Token',user.csrf).send({fullName:'Phase Five User',phone:'9999999999',addressLine1:'12 Park Street',city:'Kolkata',state:'West Bengal',postalCode:'700016'}).expect(201)).body.data.id as string;
  await user.client.post('/api/cart/items').set('X-CSRF-Token',user.csrf).send({menuItemId:itemId,quantity:1}).expect(201);
  const input={addressId:address,idempotencyKey:crypto.randomUUID()};
  const initiated=(await user.client.post('/api/payments/create-order').set('X-CSRF-Token',user.csrf).send(input).expect(201)).body.data as {orderId:string;razorpayOrderId:string;amountPaise:number};
  assert.equal(initiated.amountPaise,20000);
  await user.client.post('/api/payments/create-order').set('X-CSRF-Token',user.csrf).send(input).expect(200);
  assert.equal((await user.client.get('/api/cart').expect(200)).body.data.items.length,1);
  const paymentId='pay_test_captured';
  payments.set(paymentId,{id:paymentId,order_id:initiated.razorpayOrderId,amount:initiated.amountPaise,currency:'INR',status:'captured',method:'upi'});
  await user.client.post('/api/payments/verify').set('X-CSRF-Token',user.csrf).send({orderId:initiated.orderId,razorpayOrderId:initiated.razorpayOrderId,razorpayPaymentId:paymentId,razorpaySignature:'a'.repeat(64)}).expect(400);
  assert.equal((await user.client.get('/api/cart').expect(200)).body.data.items.length,1);
  const signature=crypto.createHmac('sha256',env.RAZORPAY_KEY_SECRET!).update(`${initiated.razorpayOrderId}|${paymentId}`).digest('hex');
  const verified=(await user.client.post('/api/payments/verify').set('X-CSRF-Token',user.csrf).send({orderId:initiated.orderId,razorpayOrderId:initiated.razorpayOrderId,razorpayPaymentId:paymentId,razorpaySignature:signature}).expect(200)).body.data;
  assert.equal(verified.checkoutState,'CONFIRMED');
  assert.equal((await user.client.get('/api/cart').expect(200)).body.data.items.length,0);
  assert.equal((await Payment.findOne({orderId:initiated.orderId}))?.status,'CAPTURED');
  const event={event:'payment.captured',payload:{payment:{entity:payments.get(paymentId)}}};const raw=JSON.stringify(event);
  const webhookSignature=crypto.createHmac('sha256',env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex');
  await supertest(app).post('/api/payments/webhook').set('Content-Type','application/json').set('x-razorpay-signature',webhookSignature).set('x-razorpay-event-id','evt_phase5_capture').send(raw).expect(200);
  const replay=await supertest(app).post('/api/payments/webhook').set('Content-Type','application/json').set('x-razorpay-signature',webhookSignature).set('x-razorpay-event-id','evt_phase5_capture').send(raw).expect(200);
  assert.equal(replay.body.data.duplicate,true);
  assert.equal((await Order.findById(initiated.orderId))?.statusHistory.length,1);
  const cancelled=await user.client.post(`/api/orders/${initiated.orderId}/cancel`).set('X-CSRF-Token',user.csrf).send({reason:'Test payment refund'}).expect(200);
  assert.equal(cancelled.body.data.orderStatus,'CANCELLED');
  const admin=await account('phase5-admin@example.com');await User.updateOne({email:'phase5-admin@example.com'},{$set:{role:'ADMIN'}});
  const record=await Payment.findOne({orderId:initiated.orderId});
  await user.client.post(`/api/payments/${record!._id}/refund`).set('X-CSRF-Token',user.csrf).send({amountPaise:10000,reason:'Test',idempotencyKey:crypto.randomUUID()}).expect(403);
  const firstKey=crypto.randomUUID();
  await admin.client.post(`/api/payments/${record!._id}/refund`).set('X-CSRF-Token',admin.csrf).send({amountPaise:10000,reason:'Cancelled order',idempotencyKey:firstKey}).expect(201);
  await admin.client.post(`/api/payments/${record!._id}/refund`).set('X-CSRF-Token',admin.csrf).send({amountPaise:10000,reason:'Cancelled order',idempotencyKey:firstKey}).expect(200);
  await admin.client.post(`/api/payments/${record!._id}/refund`).set('X-CSRF-Token',admin.csrf).send({amountPaise:11000,reason:'Too much',idempotencyKey:crypto.randomUUID()}).expect(409);
  refundResponseLost=true;
  await admin.client.post(`/api/payments/${record!._id}/refund`).set('X-CSRF-Token',admin.csrf).send({amountPaise:10000,reason:'Remaining balance',idempotencyKey:crypto.randomUUID()}).expect(502);
  const recovered=(await admin.client.get(`/api/payments/${record!._id}/refunds`).expect(200)).body.data as Array<{status:string}>;
  assert.equal(recovered.filter(row=>row.status==='PROCESSED').length,2);
  assert.equal((await Payment.findById(record!._id))?.status,'REFUNDED');
  await admin.client.post(`/api/payments/${record!._id}/refund`).set('X-CSRF-Token',admin.csrf).send({amountPaise:10000,reason:'Cancelled order',idempotencyKey:firstKey}).expect(200);
  const remoteRefund=[...remoteRefunds.values()][0]!;
  for(const [event,eventId] of ([['refund.processed','evt_refund_processed'],['refund.failed','evt_refund_late_failed']] as const)){
    const body=JSON.stringify({event,payload:{refund:{entity:remoteRefund}}});
    const signature=crypto.createHmac('sha256',env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest('hex');
    await supertest(app).post('/api/payments/webhook').set('Content-Type','application/json').set('x-razorpay-signature',signature).set('x-razorpay-event-id',eventId).send(body).expect(200);
  }
  assert.equal((await Payment.findById(record!._id))?.status,'REFUNDED');
});

test('admin assignment, partner consent, authorized location and delivery transitions',async()=>{
  const customer=await account('phase5-delivery-customer@example.com');
  const address=(await customer.client.post('/api/users/addresses').set('X-CSRF-Token',customer.csrf).send({fullName:'Delivery Customer',phone:'9999999999',addressLine1:'12 Park Street',city:'Kolkata',state:'West Bengal',postalCode:'700016'}).expect(201)).body.data.id as string;
  await customer.client.post('/api/cart/items').set('X-CSRF-Token',customer.csrf).send({menuItemId:itemId,quantity:1}).expect(201);
  const placed=(await customer.client.post('/api/orders').set('X-CSRF-Token',customer.csrf).send({addressId:address,paymentMethod:'COD',idempotencyKey:crypto.randomUUID()}).expect(201)).body.data;
  const admin=await account('phase5-delivery-admin@example.com');await User.updateOne({email:'phase5-delivery-admin@example.com'},{$set:{role:'ADMIN'}});
  const partner=await account('phase5-partner@example.com');const partnerId=String((await User.findOne({email:'phase5-partner@example.com'}))!._id);
  await customer.client.post('/api/deliveries/assign').set('X-CSRF-Token',customer.csrf).send({orderId:placed.id,partnerId}).expect(403);
  await admin.client.post('/api/deliveries/partners').set('X-CSRF-Token',admin.csrf).send({userId:partnerId,phone:'9999999999',vehicleType:'BIKE',vehicleNumber:'WB-01-1234',isVerified:true}).expect(201);
  for(const status of ['CONFIRMED','PREPARING','READY_FOR_PICKUP'])await admin.client.patch(`/api/orders/${placed.id}/status`).set('X-CSRF-Token',admin.csrf).send({status}).expect(200);
  const assigned=(await admin.client.post('/api/deliveries/assign').set('X-CSRF-Token',admin.csrf).send({orderId:placed.id,partnerId}).expect(201)).body.data;
  await admin.client.post('/api/deliveries/assign').set('X-CSRF-Token',admin.csrf).send({orderId:placed.id,partnerId}).expect(409);
  await partner.client.post(`/api/deliveries/${assigned.id}/location`).set('X-CSRF-Token',partner.csrf).send({latitude:22.57,longitude:88.36}).expect(403);
  await partner.client.post(`/api/deliveries/${assigned.id}/accept`).set('X-CSRF-Token',partner.csrf).expect(200);
  await partner.client.post(`/api/deliveries/${assigned.id}/tracking/start`).set('X-CSRF-Token',partner.csrf).expect(200);
  await customer.client.post(`/api/deliveries/${assigned.id}/location`).set('X-CSRF-Token',customer.csrf).send({latitude:22.57,longitude:88.36}).expect(403);
  const saved=(await partner.client.post(`/api/deliveries/${assigned.id}/location`).set('X-CSRF-Token',partner.csrf).send({latitude:22.57,longitude:88.36}).expect(200)).body.data;
  assert.equal(saved.saved,true);
  const visible=(await customer.client.get(`/api/deliveries/order/${placed.id}`).expect(200)).body.data;
  assert.equal(visible.location.coordinates[0],88.36);
  await partner.client.post(`/api/deliveries/${assigned.id}/tracking/stop`).set('X-CSRF-Token',partner.csrf).expect(200);
  assert.equal((await customer.client.get(`/api/deliveries/order/${placed.id}`).expect(200)).body.data.location,null);
  await partner.client.post(`/api/deliveries/${assigned.id}/pickup`).set('X-CSRF-Token',partner.csrf).expect(200);
  await partner.client.post(`/api/deliveries/${assigned.id}/start`).set('X-CSRF-Token',partner.csrf).expect(200);
  await partner.client.post(`/api/deliveries/${assigned.id}/complete`).set('X-CSRF-Token',partner.csrf).send({code:'000000'}).expect(403);
  await partner.client.post(`/api/deliveries/order/${placed.id}/completion-code`).set('X-CSRF-Token',partner.csrf).expect(404);
  const code=(await customer.client.post(`/api/deliveries/order/${placed.id}/completion-code`).set('X-CSRF-Token',customer.csrf).expect(200)).body.data.code;
  await partner.client.post(`/api/deliveries/${assigned.id}/complete`).set('X-CSRF-Token',partner.csrf).send({code}).expect(200);
  await partner.client.post(`/api/deliveries/${assigned.id}/complete`).set('X-CSRF-Token',partner.csrf).expect(409);
  assert.equal((await Order.findById(placed.id))?.orderStatus,'DELIVERED');
  assert.equal((await DeliveryPartner.findOne({userId:partnerId}))?.activeDeliveryId,null);
});

test('failed checkout keeps cart and captured payment reconciles after an interrupted browser callback',async()=>{
  const customer=await account('phase5-reconcile@example.com');
  const address=(await customer.client.post('/api/users/addresses').set('X-CSRF-Token',customer.csrf).send({fullName:'Reconcile Customer',phone:'9999999999',addressLine1:'12 Park Street',city:'Kolkata',state:'West Bengal',postalCode:'700016'}).expect(201)).body.data.id as string;
  await customer.client.post('/api/cart/items').set('X-CSRF-Token',customer.csrf).send({menuItemId:itemId,quantity:1}).expect(201);
  const input={addressId:address,idempotencyKey:crypto.randomUUID()};
  const first=(await customer.client.post('/api/payments/create-order').set('X-CSRF-Token',customer.csrf).send(input).expect(201)).body.data;
  const failedId='pay_test_failed';
  payments.set(failedId,{id:failedId,order_id:first.razorpayOrderId,amount:first.amountPaise,currency:'INR',status:'failed',method:'upi'});
  const signature=crypto.createHmac('sha256',env.RAZORPAY_KEY_SECRET!).update(`${first.razorpayOrderId}|${failedId}`).digest('hex');
  const failed=(await customer.client.post('/api/payments/verify').set('X-CSRF-Token',customer.csrf).send({orderId:first.orderId,razorpayOrderId:first.razorpayOrderId,razorpayPaymentId:failedId,razorpaySignature:signature}).expect(200)).body.data;
  assert.equal(failed.checkoutState,'FAILED');
  assert.equal((await customer.client.get('/api/cart').expect(200)).body.data.items.length,1);
  const second=(await customer.client.post('/api/payments/create-order').set('X-CSRF-Token',customer.csrf).send({...input,idempotencyKey:crypto.randomUUID()}).expect(201)).body.data;
  assert.notEqual(second.orderId,first.orderId);
  const capturedId='pay_test_reconciled';
  payments.set(capturedId,{id:capturedId,order_id:second.razorpayOrderId,amount:second.amountPaise,currency:'INR',status:'captured',method:'card'});
  const status=(await customer.client.get(`/api/payments/${second.orderId}/status`).expect(200)).body.data;
  assert.equal(status.checkoutState,'CONFIRMED');
  assert.equal((await customer.client.get('/api/cart').expect(200)).body.data.items.length,0);
});

test('socket subscriptions enforce order ownership and synchronize after reconnect',async()=>{
  const owner=await User.findOne({email:'phase5-delivery-customer@example.com'});
  const ownOrder=await Order.findOne({userId:owner!._id});
  const otherOrder=await Order.findOne({userId:(await User.findOne({email:'phase5-customer@example.com'}))!._id});
  const sessionId=crypto.randomUUID();
  await RefreshSession.create({userId:owner!._id,sessionId,tokenHash:crypto.randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+60000)});
  const token=jwt.sign({sub:String(owner!._id),sid:sessionId},env.JWT_ACCESS_SECRET,{algorithm:'HS256',issuer:'foodiego',expiresIn:'1m'});
  const server=createServer(app);const realtime=attachRealtime(server,env);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const url=`ws://127.0.0.1:${address.port}/api/socket.io/?EIO=4&transport=websocket`;
  async function connect(){
    const socket=new WebSocket(url,{headers:{Cookie:`fg_access=${token}`}});
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Socket connect timeout')),5000);socket.on('error',reject);socket.on('message',data=>{const message=data.toString();if(message.startsWith('0'))socket.send('40');else if(message.startsWith('40')){clearTimeout(timer);resolve();}});});
    return socket;
  }
  async function subscribe(socket:WebSocket,id:number,orderId:string){
    return new Promise<{ok:boolean;orderStatus?:string;statusHistory?:unknown[]}>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Socket acknowledgement timeout')),5000);
      const listener=(data:WebSocket.RawData)=>{const message=data.toString();if(!message.startsWith(`43${id}`))return;clearTimeout(timer);socket.off('message',listener);resolve(JSON.parse(message.slice(2+String(id).length))[0]);};
      socket.on('message',listener);socket.send(`42${id}${JSON.stringify(['order:subscribe',{orderId}])}`);
    });
  }
  try{
    const socket=await connect();
    assert.equal((await subscribe(socket,1,String(ownOrder!._id))).ok,true);
    assert.equal((await subscribe(socket,2,String(otherOrder!._id))).ok,false);
    socket.terminate();
    const reconnect=await connect();
    const snapshot=await subscribe(reconnect,3,String(ownOrder!._id));
    assert.equal(snapshot.orderStatus,'DELIVERED');
    assert.ok(snapshot.statusHistory?.length);
    reconnect.terminate();
  }finally{await new Promise<void>(resolve=>realtime.close(()=>resolve()));}
});
