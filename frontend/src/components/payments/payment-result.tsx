'use client';
import Link from 'next/link';
import { useSearchParams,useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { paymentService } from '@/services/payments';
import { rupees } from '@/services/commerce';
import { Button } from '@/components/ui/button';

export function PaymentResult({view}:{view:'success'|'failed'|'pending'}){
  const params=useSearchParams(),router=useRouter(),orderId=params.get('orderId')||'';
  const query=useQuery({queryKey:['payment-status',orderId],queryFn:()=>paymentService.status(orderId),enabled:!!orderId,refetchInterval:current=>current.state.data?.checkoutState==='PENDING_PAYMENT'?5000:false});
  const result=query.data;
  useEffect(()=>{if(!result)return;const target=result.checkoutState==='CONFIRMED'?'success':result.checkoutState==='FAILED'?'failed':'pending';if(target!==view)router.replace(`/payment/${target}?orderId=${encodeURIComponent(orderId)}`);},[result,view,router,orderId]);
  return <main className="container page-space"><section className="panel p-6 max-w-2xl mx-auto"><span className="eyebrow red">FOODIEGO PAYMENT</span>
    {!orderId?<><h1 className="page-title">Order ID is missing</h1><Button asChild className="mt-5"><Link href="/orders">View orders</Link></Button></>:query.isPending?<><h1 className="page-title">Checking payment status</h1><p>Please wait while we confirm your payment with the server.</p></>:query.isError||!result?<><h1 className="page-title">Could not check payment</h1><p role="alert">{query.error?.message||'Payment status is unavailable.'}</p><Button className="mt-5" onClick={()=>void query.refetch()}>Try again</Button></>:result.checkoutState==='CONFIRMED'?<><h1 className="page-title">Payment confirmed</h1><p>Order {result.orderNumber} from {result.restaurantName}</p><p className="text-xl font-semibold mt-3">Paid {rupees(result.amountPaise)}</p><Button asChild className="mt-6"><Link href={`/orders/${result.orderId}`}>View order</Link></Button></>:result.checkoutState==='FAILED'?<><h1 className="page-title">Payment failed</h1><p>{result.failureReason||'Your payment could not be completed.'} Your cart is still available.</p><div className="flex gap-3 mt-6"><Button asChild><Link href="/checkout">Retry payment</Link></Button><Button asChild variant="outline"><Link href="/cart">View cart</Link></Button></div></>:<><h1 className="page-title">Payment is processing</h1><p>We are checking the provider for order {result.orderNumber}. Keep this page open or come back later. Your cart will be cleared only after payment is confirmed.</p><Button className="mt-6" onClick={()=>void query.refetch()}>Refresh status</Button><Button asChild variant="outline" className="mt-6 ml-2"><Link href="/checkout">Back to checkout</Link></Button></>}
  </section></main>;
}
