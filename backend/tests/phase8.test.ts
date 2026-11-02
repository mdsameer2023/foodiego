import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {createServer} from 'node:http';
import supertest from 'supertest';
import WebSocket from 'ws';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {connectDatabase,disconnectDatabase} from '../src/config/database.js';
import {ensureDatabaseIndexes,indexModels} from '../src/config/indexes.js';
import {loadEnv} from '../src/config/env.js';
import {createApp} from '../src/app.js';
import {User} from '../src/models/User.js';
import {Payment} from '../src/models/Payment.js';
import {RefreshSession} from '../src/models/RefreshSession.js';
import {attachRealtime,closeRealtime} from '../src/services/realtime.js';
import {safeLogError} from '../src/utils/logger.js';
const base={NODE_ENV:'production',PORT:'5000',MONGODB_URI:'mongodb://127.0.0.1/unused',JWT_ACCESS_SECRET:'phase8-access-only-temporary-test-value',JWT_REFRESH_SECRET:'phase8-refresh-only-temporary-test-value',FRONTEND_URL:'https://foodiego.example',BACKEND_URL:'https://api.foodiego.example',EMAIL_MODE:'disabled'};
const env=loadEnv(base);
let mongo:MongoMemoryReplSet;
const previousMode=process.env.NODE_ENV;
before(async()=>{
  process.env.NODE_ENV='production';
  mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  await connectDatabase(mongo.getUri(),'foodiego_phase8_isolated');
});
after(async()=>{await closeRealtime();await disconnectDatabase();await mongo?.stop();if(previousMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousMode;});

test('production configuration rejects insecure origins and live payment keys',()=>{
 assert.throws(()=>loadEnv({...base,FRONTEND_URL:'http://foodiego.example'}),/HTTPS/);
 assert.throws(()=>loadEnv({...base,RAZORPAY_KEY_ID:'rzp_live_forbidden',RAZORPAY_KEY_SECRET:'synthetic-secret'}),/test keys/);
 assert.throws(()=>loadEnv({...base,EMAIL_MODE:'console'}),/Console email/);
});

test('fresh production databases receive all critical unique and TTL indexes without data loss',async()=>{
 await ensureDatabaseIndexes();
 for(const name of ['User','Cart','Payment','Refund','RefreshSession','DeliveryAssignment']) assert.ok(indexModels.some(model=>model.modelName===name));
 const account=await User.create({name:'Index Verification',email:'phase8-index@example.invalid',passwordHash:'synthetic-test-only'});
 await assert.rejects(User.create({name:'Duplicate',email:account.email,passwordHash:'synthetic-test-only'}),{code:11000});
 const payments=await Payment.collection.indexes();
 assert.ok(payments.some(index=>index.key.razorpayPaymentId===1&&index.unique));
 const sessions=await RefreshSession.collection.indexes();
 assert.ok(sessions.some(index=>index.key.expiresAt===1&&index.expireAfterSeconds===0));
 await ensureDatabaseIndexes();
 assert.ok(await User.exists({_id:account._id}));
});

test('production cookie, CORS, CSRF and private endpoint boundaries are enforced',async()=>{
 const app=createApp(env,{paymentGateway:null,aiProvider:null});
 const csrf=await supertest(app).get('/api/auth/csrf').set('Origin',env.FRONTEND_URL).expect(200);
 const csrfCookie=(csrf.headers['set-cookie'] as unknown as string[])[0]!;
 const cookie=csrfCookie.split(';')[0]!;
 assert.match(csrfCookie,/Secure/);
 assert.equal(csrf.headers['access-control-allow-origin'],env.FRONTEND_URL);
 await supertest(app).get('/api/health/ready').set('Origin','https://attacker.example').expect(403);
 await supertest(app).post('/api/auth/register').send({name:'Test',email:'no-csrf@example.invalid',password:'Password123!'}).expect(403);
 const registered=await supertest(app).post('/api/auth/register').set('Origin',env.FRONTEND_URL).set('Cookie',cookie).set('X-CSRF-Token',csrf.body.data.csrfToken).send({name:'Phase Eight',email:'phase8-cookie@example.invalid',password:'Password123!'}).expect(201);
 const access=(registered.headers['set-cookie'] as unknown as string[]).find(value=>value.startsWith('fg_access='))!;
 assert.match(access,/HttpOnly/);assert.match(access,/Secure/);assert.match(access,/Path=\/api/);
 await supertest(app).get('/api/admin/monitoring').set('Cookie',access.split(';')[0]!).expect(403);
 await supertest(app).get('/api/owner/restaurants').expect(401);
 await supertest(app).get('/api/partner/profile').expect(401);
});

test('WebSocket upgrades reject untrusted browser origins and allow the configured origin',async()=>{
 const server=createServer();attachRealtime(server,env);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as {port:number}).port;
 const connect=(origin:string)=>new Promise<number>((resolve,reject)=>{
  const socket=new WebSocket(`ws://127.0.0.1:${port}/api/socket.io/?EIO=4&transport=websocket`,{headers:{Origin:origin},handshakeTimeout:5000});
  socket.on('open',()=>{socket.close();resolve(101);});
  socket.on('unexpected-response',(_request,response)=>{response.resume();resolve(response.statusCode||0);});
  socket.on('error',reject);
 });
 try{assert.ok([400,403].includes(await connect('https://attacker.example')));assert.equal(await connect(env.FRONTEND_URL),101);}
 finally{await closeRealtime();if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('provider error serialization never includes credentials, raw messages or request config',()=>{
 const error=Object.assign(new Error('synthetic-secret-in-message'),{config:{headers:{Authorization:'synthetic-secret-in-header'}},status:502,code:'ECONNRESET'});
 const encoded=JSON.stringify(safeLogError(error));
 assert.equal(encoded.includes('synthetic-secret'),false);assert.equal(encoded.includes('config'),false);assert.match(encoded,/ECONNRESET/);
});
