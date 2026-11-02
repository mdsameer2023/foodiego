import { api } from './api';

export type PaymentState={orderId:string;orderNumber:string;restaurantName:string;amountPaise:number;paymentStatus:string;checkoutState:'PENDING_PAYMENT'|'CONFIRMED'|'FAILED';attemptStatus:string|null;failureReason:string|null};
export type PaymentSession={orderId:string;razorpayOrderId:string;amountPaise:number;currency:'INR';keyId:string};
type CheckoutResponse={razorpay_payment_id:string;razorpay_order_id:string;razorpay_signature:string};
type CheckoutOptions={key:string;amount:number;currency:string;name:string;description:string;order_id:string;handler:(response:CheckoutResponse)=>void;modal:{ondismiss:()=>void};theme:{color:string}};
type CheckoutWindow=Window & {Razorpay?:new(options:CheckoutOptions)=>{open:()=>void;on:(event:string,listener:()=>void)=>void}};

export const paymentService={
  create:(input:{addressId:string;code?:string;deliveryInstructions:string;idempotencyKey:string})=>api<PaymentSession>('/payments/create-order',{method:'POST',body:JSON.stringify(input)}),
  verify:(input:{orderId:string;razorpayOrderId:string;razorpayPaymentId:string;razorpaySignature:string})=>api<{checkoutState:string;paymentStatus:string}>('/payments/verify',{method:'POST',body:JSON.stringify(input)}),
  status:(orderId:string)=>api<PaymentState>(`/payments/${encodeURIComponent(orderId)}/status`),
};

let scriptPromise:Promise<void>|undefined;
export function loadRazorpay(){
  if(typeof window==='undefined')return Promise.reject(new Error('Checkout requires a browser'));
  if((window as CheckoutWindow).Razorpay)return Promise.resolve();
  scriptPromise??=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
    script.onload=()=>resolve();script.onerror=()=>{scriptPromise=undefined;reject(new Error('Could not load secure payment checkout'));};document.head.appendChild(script);
  });
  return scriptPromise;
}

export function openRazorpay(session:PaymentSession,onSuccess:(response:CheckoutResponse)=>void,onDismiss:()=>void){
  const Constructor=(window as CheckoutWindow).Razorpay;
  if(!Constructor)throw new Error('Payment checkout is unavailable');
  const checkout=new Constructor({key:session.keyId,amount:session.amountPaise,currency:session.currency,name:'FoodieGo',description:'Food delivery order',order_id:session.razorpayOrderId,handler:onSuccess,modal:{ondismiss:onDismiss},theme:{color:'#e73545'}});
  checkout.open();
}
