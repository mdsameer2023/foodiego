'use client';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

export function useOrderRealtime(orderId:string){
  const client=useQueryClient();
  useEffect(()=>{
    if(!orderId)return;
    const origin=(process.env.NEXT_PUBLIC_API_URL||'http://localhost:5000/api').replace(/\/api\/?$/,'');
    const socket=io(origin,{path:'/api/socket.io',withCredentials:true,transports:['websocket','polling'],reconnection:true});
    const refresh=()=>{void client.invalidateQueries({queryKey:['order',orderId]});void client.invalidateQueries({queryKey:['delivery',orderId]});};
    socket.on('connect',()=>{socket.emit('order:subscribe',{orderId},(result:{ok:boolean})=>{if(result.ok)refresh();});});
    for(const event of ['order:confirmed','order:preparing','order:ready','delivery:assigned','delivery:picked_up','delivery:on_the_way','order:delivered','order:cancelled','delivery:location'])socket.on(event,refresh);
    return()=>{socket.emit('order:unsubscribe',{orderId});socket.disconnect();};
  },[orderId,client]);
}
