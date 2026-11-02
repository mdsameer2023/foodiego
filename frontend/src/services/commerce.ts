import { api } from './api';

export type Selection={group:string;options:string[]};
export type CartLine={key:string;menuItemId:string;name:string;image:string;quantity:number;unitPricePaise:number;selections:Array<{group:string;options:Array<{name:string;pricePaise:number}>}>;customizationPaise:number;totalPaise:number;specialInstructions:string};
export type Pricing={subtotalPaise:number;customizationPaise:number;deliveryFeePaise:number;packagingFeePaise:number;taxPaise:number;discountPaise:number;totalPaise:number};
export type CartView={restaurant:{id:string;name:string;image:string;averageDeliveryTime:number;isOpen:boolean;codEnabled:boolean}|null;items:CartLine[];pricing:Pricing;coupon?:{code:string;discountPaise:number}|null};
export type Coupon={code:string;description:string;discountType:'PERCENT'|'FIXED';discountValue:number;maxDiscountPaise:number;minimumOrderPaise:number;expiresAt:string;isSample:boolean};
export type OrderStatus='PLACED'|'CONFIRMED'|'PREPARING'|'READY_FOR_PICKUP'|'PICKED_UP'|'ON_THE_WAY'|'DELIVERED'|'CANCELLED';
export type Order={id:string;orderNumber:string;restaurantId:string;restaurantSnapshot:{name:string;image:string;averageDeliveryTime:number};items:Array<Omit<CartLine,'key'>>;deliveryAddressSnapshot:{fullName:string;phone:string;addressLine1:string;addressLine2?:string;city:string;state:string;postalCode:string};deliveryInstructions:string;pricingBreakdown:Pricing;couponSnapshot?:{code:string;discountPaise:number}|null;paymentMethod:'COD'|'ONLINE';paymentStatus:'PENDING'|'PAID'|'FAILED'|'REFUNDED'|'PARTIALLY_REFUNDED';orderStatus:OrderStatus;statusHistory:Array<{status:OrderStatus;at:string}>;placedAt:string;cancelledAt?:string;cancellationReason?:string};
export type OrderPage={data:Order[];meta:{page:number;limit:number;total:number;pages:number}};
export type ReorderResult={cart:CartView;unavailable:string[];priceChanges:Array<{name:string;wasPaise:number;nowPaise:number}>};
export const rupees=(amountPaise:number)=>`₹${(amountPaise/100).toLocaleString('en-IN',{minimumFractionDigits:amountPaise%100?2:0,maximumFractionDigits:2})}`;
export const commerceService={
  cart:()=>api<CartView>('/cart'),
  add:(input:{menuItemId:string;quantity?:number;selections?:Selection[];specialInstructions?:string})=>api<CartView>('/cart/items',{method:'POST',body:JSON.stringify(input)}),
  update:(key:string,input:{quantity?:number;specialInstructions?:string})=>api<CartView>(`/cart/items/${key}`,{method:'PATCH',body:JSON.stringify(input)}),
  remove:(key:string)=>api<CartView>(`/cart/items/${key}`,{method:'DELETE'}),
  clear:()=>api<CartView>('/cart',{method:'DELETE'}),
  coupons:()=>api<Coupon[]>('/coupons/available'),
  validateCoupon:(code:string)=>api<CartView>('/coupons/validate',{method:'POST',body:JSON.stringify({code})}),
  quote:(code?:string,addressId?:string)=>api<CartView>('/checkout/quote',{method:'POST',body:JSON.stringify({code:code||undefined,addressId})}),
  place:(input:{addressId:string;code?:string;deliveryInstructions:string;paymentMethod:'COD';idempotencyKey:string})=>api<Order>('/orders',{method:'POST',body:JSON.stringify(input)}),
  orders:async(page=1,status?:OrderStatus):Promise<OrderPage>=>{
    const url=`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/orders?page=${page}${status?`&status=${status}`:''}`;
    let response=await fetch(url,{credentials:'include',cache:'no-store'});
    if(response.status===401){await api('/auth/refresh',{method:'POST'},false);response=await fetch(url,{credentials:'include',cache:'no-store'});}
    const body=await response.json();if(!response.ok)throw new Error(body.error?.message||'Could not load orders');return body as OrderPage;
  },
  order:(id:string)=>api<Order>(`/orders/${encodeURIComponent(id)}`),
  cancel:(id:string,reason:string)=>api<Order>(`/orders/${encodeURIComponent(id)}/cancel`,{method:'POST',body:JSON.stringify({reason})}),
  reorder:(id:string,replaceExisting=false)=>api<ReorderResult>(`/orders/${encodeURIComponent(id)}/reorder`,{method:'POST',body:JSON.stringify({replaceExisting})}),
};
