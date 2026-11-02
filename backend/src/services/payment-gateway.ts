import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import type { Env } from '../config/env.js';

export type GatewayOrder={id:string;amount:number|string;currency:string};
export type GatewayPayment={id:string;order_id:string;amount:number|string;currency:string;status:string;method?:string|null};
export type GatewayRefund={id:string;payment_id:string;amount?:number;status:string;receipt?:string|null};
export interface PaymentGateway {
  createOrder(input:{amount:number;receipt:string}):Promise<GatewayOrder>;
  fetchPayment(id:string):Promise<GatewayPayment>;
  fetchOrderPayments(id:string):Promise<GatewayPayment[]>;
  refundPayment(id:string,input:{amount:number;receipt:string}):Promise<GatewayRefund>;
  fetchRefund(id:string):Promise<GatewayRefund>;
  fetchPaymentRefunds(id:string):Promise<GatewayRefund[]>;
}

export function createPaymentGateway(env:Env):PaymentGateway|null {
  if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)return null;
  const client=new Razorpay({key_id:env.RAZORPAY_KEY_ID,key_secret:env.RAZORPAY_KEY_SECRET});
  return {
    createOrder:input=>client.orders.create({amount:input.amount,currency:'INR',receipt:input.receipt}),
    fetchPayment:id=>client.payments.fetch(id),
    fetchOrderPayments:async id=>(await client.orders.fetchPayments(id)).items,
    refundPayment:(id,input)=>client.payments.refund(id,{amount:input.amount,receipt:input.receipt,speed:'normal'}),
    fetchRefund:id=>client.refunds.fetch(id),
    fetchPaymentRefunds:async id=>{
      const rows:GatewayRefund[]=[];
      for(let skip=0;skip<1000;skip+=100){
        const page=await client.payments.fetchMultipleRefund(id,{count:100,skip});
        rows.push(...page.items);
        if(page.items.length<100)break;
      }
      return rows;
    },
  };
}

export function validHmac(message:string|Buffer,secret:string,signature:string):boolean {
  if(!/^[a-f\d]{64}$/i.test(signature))return false;
  const expected=crypto.createHmac('sha256',secret).update(message).digest();
  return crypto.timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
