'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useOrderRealtime } from '@/hooks/use-order-realtime';
import { commerceService,rupees,type OrderStatus } from '@/services/commerce';
import { deliveryService } from '@/services/deliveries';
import { Button } from '@/components/ui/button';

const stages:OrderStatus[]=['PLACED','CONFIRMED','PREPARING','READY_FOR_PICKUP','PICKED_UP','ON_THE_WAY','DELIVERED'];
export function OrderTracking({id}:{id:string}){
  const {data:user,isPending}=useAuth();useOrderRealtime(user?id:'');
  const order=useQuery({queryKey:['order',id],queryFn:()=>commerceService.order(id),enabled:!!user,refetchInterval:15000});
  const delivery=useQuery({queryKey:['delivery',id],queryFn:()=>deliveryService.byOrder(id),enabled:!!user,refetchInterval:15000});
  if(isPending||order.isPending)return <main className="container page-space"><div className="skeleton h-96 rounded-2xl"/></main>;
  if(!user)return <main className="container empty-state"><h1>Log in to track your order</h1><Button asChild><Link href={`/login?next=/orders/${id}/track`}>Log in</Link></Button></main>;
  if(!order.data)return <main className="container empty-state"><h1>Order unavailable</h1><p>{order.error?.message}</p></main>;
  const row=order.data,assignment=delivery.data;
  const key=process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const pickup=assignment?.pickupLocation?.coordinates,drop=assignment?.deliveryLocation?.coordinates,location=assignment?.location?.coordinates;
  const canMap=!!key&&!!location&&assignment?.trackingEnabled;
  const point=(coordinates:[number,number])=>`${coordinates[1]},${coordinates[0]}`;
  const destination=drop?point(drop):[row.deliveryAddressSnapshot.addressLine1,row.deliveryAddressSnapshot.city,row.deliveryAddressSnapshot.state,row.deliveryAddressSnapshot.postalCode].filter(Boolean).join(', ');
  const waypoint=pickup&&assignment?.assignmentStatus==='ACCEPTED'?`&waypoints=${encodeURIComponent(point(pickup))}`:'';
  const map=canMap?`https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(key!)}&origin=${encodeURIComponent(point(location!))}&destination=${encodeURIComponent(destination)}${waypoint}&mode=driving`:'';
  return <main className="container page-space"><div className="breadcrumb"><Link href="/orders">Orders</Link> / <Link href={`/orders/${id}`}>{row.orderNumber}</Link> / Track</div><span className="eyebrow red">LIVE ORDER STATUS</span><h1 className="page-title">{row.restaurantSnapshot.name}</h1><p className="muted mb-6">Order {row.orderNumber} · {row.orderStatus.replaceAll('_',' ')}</p>
    <div className="checkout-layout"><div className="space-y-5"><section className="panel p-5"><h2 className="text-xl font-semibold mb-3">Delivery progress</h2><p className="font-semibold">{row.orderStatus.replaceAll('_',' ')}</p>{canMap?<iframe title="Live delivery route" className="w-full rounded-xl mt-4" style={{height:360,border:0}} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={map}/>:<p className="notice mt-4">Live map is unavailable. Follow the order status below.</p>}
    <ol className="timeline order-tracking mt-5">{stages.map(stage=>{const history=row.statusHistory.find(entry=>entry.status===stage);return <li key={stage} className={history?'current':''}><strong>{stage.replaceAll('_',' ')}</strong><small>{history?new Date(history.at).toLocaleString('en-IN'):'Waiting for update'}</small></li>;})}</ol>{row.orderStatus==='CANCELLED'&&<p className="red">Order cancelled.</p>}</section></div>
    <aside className="space-y-5"><section className="panel p-5"><h2 className="text-xl font-semibold mb-3">Delivery partner</h2>{assignment?<><p>{assignment.partner?.name||'Assignment in progress'}</p>{assignment.partner?.phone&&<p><a href={`tel:${assignment.partner.phone}`}>{assignment.partner.phone}</a></p>}<p className="muted text-sm">{assignment.assignmentStatus.replaceAll('_',' ')}</p>{assignment.location?.lastUpdatedAt&&<p className="muted text-sm">Location updated {new Date(assignment.location.lastUpdatedAt).toLocaleString('en-IN')}</p>}</>:<p className="muted">Partner will appear here after assignment.</p>}</section><section className="panel p-5"><h2 className="text-xl font-semibold mb-3">Delivery address</h2><p>{row.deliveryAddressSnapshot.addressLine1}, {row.deliveryAddressSnapshot.city}, {row.deliveryAddressSnapshot.state} {row.deliveryAddressSnapshot.postalCode}</p></section><section className="panel p-5"><h2 className="text-xl font-semibold mb-3">Order summary</h2>{row.items.map((item,index)=><p key={`${item.menuItemId}-${index}`} className="flex justify-between"><span>{item.quantity} × {item.name}</span><strong>{rupees(item.totalPaise)}</strong></p>)}<p className="flex justify-between border-t pt-3 mt-3"><strong>Total</strong><strong>{rupees(row.pricingBreakdown.totalPaise)}</strong></p></section><Button asChild variant="outline"><Link href={`/orders/${id}`}>View order details</Link></Button></aside></div>
  </main>;
}
