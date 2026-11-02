import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import type { Env } from '../config/env.js';
import { verifyAccess } from './auth.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { Restaurant } from '../models/Restaurant.js';
import { DeliveryAssignment } from '../models/DeliveryAssignment.js';

let io:Server|null=null;
export async function closeRealtime(){if(io){const current=io;io=null;await new Promise<void>(resolve=>current.close(()=>resolve()));}}
export function publishAdminNotice(resource:string,id:unknown){io?.to('workspace:admin').emit('workspace:update',{resource,id:String(id)});}
export function disconnectSession(sessionId:unknown){io?.in(`session:${String(sessionId)}`).disconnectSockets(true);}
export function publishOrderEvent(orderId:unknown,event:string,payload:Record<string,unknown>){
  void broadcastAuthorized(orderId,event,payload);
  void publishWorkspaceUpdate(orderId);
}
export function disconnectAccount(userId:unknown){io?.in(`account:${String(userId)}`).disconnectSockets(true);}
async function broadcastAuthorized(orderId:unknown,event:string,payload:Record<string,unknown>){
  if(!io)return;
  try{
    const order=await Order.findById(orderId).select('userId restaurantId assignedDeliveryPartnerId');if(!order)return;
    const restaurant=await Restaurant.findById(order.restaurantId).select('ownerId');
    for(const socket of await io.in(`order:${String(orderId)}`).fetchSockets()){
      const identity=socket.data.user as {id:string;role:string};
      if(!await RefreshSession.exists({sessionId:socket.data.sessionId,userId:identity.id,expiresAt:{$gt:new Date()}})){socket.disconnect(true);continue;}
      const account=await User.findOne({_id:identity.id,isActive:true}).select('role');
      const allowed=account&&(account.role==='ADMIN'||String(order.userId)===identity.id||account.role==='RESTAURANT_OWNER'&&String(restaurant?.ownerId)===identity.id||account.role==='DELIVERY_PARTNER'&&String(order.assignedDeliveryPartnerId)===identity.id);
      if(allowed)socket.emit(event,{orderId:String(orderId),...payload});else await socket.leave(`order:${String(orderId)}`);
    }
  }catch{/* REST polling recovers missed events. */}
}
async function publishWorkspaceUpdate(orderId:unknown){
  if(!io)return;
  try{
    const order=await Order.findById(orderId).select('restaurantId assignedDeliveryPartnerId');if(!order)return;
    const restaurant=await Restaurant.findById(order.restaurantId).select('ownerId');
    io.to('workspace:admin').emit('workspace:update',{orderId:String(orderId)});
    if(restaurant?.ownerId)io.to(`workspace:${String(restaurant.ownerId)}`).emit('workspace:update',{orderId:String(orderId)});
    const partnerId=order.assignedDeliveryPartnerId||(await DeliveryAssignment.findOne({orderId:order._id,assignmentStatus:'OFFERED'}).select('deliveryPartnerId'))?.deliveryPartnerId;
    if(partnerId)io.to(`workspace:${String(partnerId)}`).emit('workspace:update',{orderId:String(orderId)});
  }catch{/* Dashboards also reconcile using authenticated polling. */}
}
export function attachRealtime(server:HttpServer,env:Env){
  // Auth cookies are scoped to /api, so the socket handshake must live there too.
  io=new Server(server,{cors:{origin:env.FRONTEND_URL,credentials:true},path:'/api/socket.io',allowRequest:(req,callback)=>callback(null,!req.headers.origin||req.headers.origin===env.FRONTEND_URL)});
  io.use(async(socket,next)=>{
    try{
      const cookies=Object.fromEntries((socket.handshake.headers.cookie||'').split(';').map(part=>part.trim().split(/=(.*)/s,2)).filter(pair=>pair.length===2));
      const payload=verifyAccess(cookies.fg_access,env);
      const session=await RefreshSession.exists({sessionId:payload.sid,userId:payload.sub,expiresAt:{$gt:new Date()}});
      const user=session?await User.findById(payload.sub):null;
      if(!user||!user.isActive)throw new Error('Unauthenticated');
      socket.data.user={id:String(user._id),role:user.role};socket.data.sessionId=payload.sid;next();
    }catch{next(new Error('Unauthenticated'));}
  });
  io.on('connection',socket=>{
    const account=socket.data.user as {id:string;role:string};
    void socket.join(`account:${account.id}`);
    void socket.join(`session:${String(socket.data.sessionId)}`);
    if(account.role==='ADMIN')void socket.join('workspace:admin');
    if(['ADMIN','RESTAURANT_OWNER','DELIVERY_PARTNER'].includes(account.role))void socket.join(`workspace:${account.id}`);
    socket.on('order:subscribe',async(input:unknown,reply?:(result:unknown)=>void)=>{
      try{
      const identity=socket.data.user as {id:string;role:string};
      const session=await RefreshSession.exists({sessionId:socket.data.sessionId,userId:identity.id,expiresAt:{$gt:new Date()}});
      const current=session?await User.findOne({_id:identity.id,isActive:true}).select('role'):null;
      if(!current){reply?.({ok:false,error:'Unauthenticated'});socket.disconnect(true);return;}
      socket.data.user={id:identity.id,role:current.role};
      const orderId=typeof input==='object'&&input!==null&&'orderId'in input?String(input.orderId):'';
      if(!mongoose.isValidObjectId(orderId)){reply?.({ok:false,error:'Invalid order'});return;}
      const order=await Order.findById(orderId).select('userId restaurantId assignedDeliveryPartnerId orderStatus paymentStatus statusHistory');
      if(!order){reply?.({ok:false,error:'Order unavailable'});return;}
      const user=socket.data.user as {id:string;role:string};
      const owner=user.id===String(order.userId);
      const partner=user.role==='DELIVERY_PARTNER'&&user.id===String(order.assignedDeliveryPartnerId);
      const restaurantOwner=user.role==='RESTAURANT_OWNER'&&String((await Restaurant.findById(order.restaurantId).select('ownerId'))?.ownerId)===user.id;
      if(!owner&&!partner&&!restaurantOwner&&user.role!=='ADMIN'){reply?.({ok:false,error:'Access denied'});return;}
      await socket.join(`order:${orderId}`);
      reply?.({ok:true,orderStatus:order.orderStatus,paymentStatus:order.paymentStatus,statusHistory:order.statusHistory});
      }catch{reply?.({ok:false,error:'Order updates temporarily unavailable'});}
    });
    socket.on('order:unsubscribe',(input:unknown)=>{const orderId=typeof input==='object'&&input!==null&&'orderId'in input?String(input.orderId):'';if(mongoose.isValidObjectId(orderId))void socket.leave(`order:${orderId}`);});
  });
  return io;
}
