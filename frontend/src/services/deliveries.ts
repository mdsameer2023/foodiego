import { api } from './api';
export type Delivery={order?:{orderNumber:string;deliveryInstructions:string;deliveryAddressSnapshot:{fullName:string;addressLine1:string;city:string;state:string;postalCode:string};items:{name:string;quantity:number;specialInstructions?:string}[]};restaurant?:{name:string;address:string;city:string};id:string;orderId:string;restaurantId:string;assignmentStatus:'OFFERED'|'ACCEPTED'|'REJECTED'|'PICKED_UP'|'ON_THE_WAY'|'DELIVERED'|'CANCELLED';trackingEnabled:boolean;assignedAt:string;partner?:{name:string;phone:string|null};location?:{coordinates:[number,number];lastUpdatedAt:string}|null;pickupLocation?:{coordinates:[number,number]};deliveryLocation?:{coordinates:[number,number]}};
export const deliveryService={
  byOrder:(orderId:string)=>api<Delivery|null>(`/deliveries/order/${encodeURIComponent(orderId)}`),
  mine:()=>api<Delivery[]>('/deliveries/mine'),
  detail:(id:string)=>api<Delivery>(`/deliveries/${encodeURIComponent(id)}`),
  action:(id:string,action:'accept'|'reject'|'pickup'|'start'|'complete'|'tracking/start'|'tracking/stop',code?:string)=>api<Delivery|{trackingEnabled:boolean}>(`/deliveries/${encodeURIComponent(id)}/${action}`,{method:'POST',...(code?{body:JSON.stringify({code})}:{})}),
  location:(id:string,latitude:number,longitude:number)=>api<{saved:boolean;lastUpdatedAt:string}>(`/deliveries/${encodeURIComponent(id)}/location`,{method:'POST',body:JSON.stringify({latitude,longitude})}),
};
