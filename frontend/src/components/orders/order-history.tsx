'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { PackageCheck,ShoppingBag } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { commerceService,rupees,type OrderStatus,type Order } from '@/services/commerce';
import { localImage } from '@/services/catalog';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export function OrderHistory() {
  const {data:user,isPending:authPending}=useAuth();const client=useQueryClient();
  const [page,setPage]=useState(1),[status,setStatus]=useState<OrderStatus|''>(''),[replacing,setReplacing]=useState<Order|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const query=useQuery({queryKey:['orders',page,status],queryFn:()=>commerceService.orders(page,status||undefined),enabled:!!user});
  async function reorder(order:Order,replaceExisting=false){setBusy(true);setError('');try{const result=await commerceService.reorder(order.id,replaceExisting);setReplacing(null);await client.invalidateQueries({queryKey:['cart',user?.id]});setMessage([result.unavailable.length?`Unavailable: ${result.unavailable.join(', ')}.`:'',result.priceChanges.length?`Current prices changed for: ${result.priceChanges.map(item=>item.name).join(', ')}.`:'','Review the cart before checkout.'].filter(Boolean).join(' '));}catch(cause){if(cause instanceof Error && cause.message.includes('Confirm before replacing'))setReplacing(order);else setError(cause instanceof Error?cause.message:'Could not reorder');}finally{setBusy(false);}}
  if(authPending)return <main className="container page-space"><div className="skeleton h-80 rounded-2xl"/></main>;
  if(!user)return <main className="container empty-state"><h1>Your orders</h1><p>Log in to see your saved orders.</p><Button asChild><Link href="/login?next=/orders">Log in</Link></Button></main>;
  return <main className="container page-space"><span className="eyebrow red">YOUR FOOD STORIES</span><h1 className="page-title">A history of happy cravings.</h1><p className="muted mb-6">Orders saved to your FoodieGo account.</p><label className="field max-w-xs mb-6">Filter by status<select value={status} onChange={event=>{setStatus(event.target.value as OrderStatus|'');setPage(1);}}><option value="">All orders</option>{(['PLACED','CONFIRMED','PREPARING','READY_FOR_PICKUP','PICKED_UP','ON_THE_WAY','DELIVERED','CANCELLED'] as const).map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
    {message&&<p role="status" className="notice green mb-4">{message} <Link className="underline" href="/cart">View cart</Link></p>}{error&&<p role="alert" className="notice red mb-4">{error}</p>}
    {query.isPending&&<div className="space-y-4">{[1,2,3].map(i=><div className="skeleton h-32 rounded-2xl" key={i}/>)}</div>}{query.isError&&<div className="notice">Could not load orders. <Button onClick={()=>query.refetch()}>Try again</Button></div>}
    {query.data?.data.length===0&&<div className="empty-state"><ShoppingBag size={40}/><h2>Your first food story is waiting.</h2><p>No orders in this view yet.</p><Button asChild><Link href="/restaurants">Find your favourite</Link></Button></div>}
    <div className="space-y-4">{query.data?.data.map(order=><article className="panel order-card" key={order.id}><div className="order-icon">{order.restaurantSnapshot?.image?<Image src={localImage(order.restaurantSnapshot.image)} alt={order.restaurantSnapshot.name} width={64} height={64} className="rounded-lg object-cover"/>:<PackageCheck size={28}/>}</div><div className="grow"><span className="eyebrow muted">{order.orderNumber} · {new Date(order.placedAt).toLocaleDateString('en-IN')}</span><h2>{order.restaurantSnapshot?.name}</h2><p className="muted">{order.items.map(item=>`${item.quantity} × ${item.name}`).join(', ')}</p><strong>{rupees(order.pricingBreakdown.totalPaise)}</strong> <span className="demo-pill ml-3">{order.orderStatus.replaceAll('_',' ')}</span><p className="muted text-sm">{order.paymentMethod==='COD'?'Cash on Delivery':'Online payment'} · {order.paymentStatus}</p></div><div className="flex gap-2 flex-wrap"><Button asChild variant="outline"><Link href={`/orders/${order.id}`}>View details</Link></Button><Button disabled={busy} onClick={()=>void reorder(order)}>Reorder</Button></div></article>)}</div>
    {query.data&&query.data.meta.pages>1&&<div className="flex justify-center gap-3 mt-6"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</Button><span>{page} / {query.data.meta.pages}</span><Button variant="outline" disabled={page>=query.data.meta.pages} onClick={()=>setPage(page+1)}>Next</Button></div>}
    <Modal open={!!replacing} onOpenChange={open=>{if(!open)setReplacing(null);}} title="Start a new cart?"><p className="mb-4">Your cart contains another restaurant. Replace it with currently available items from this order?</p><div className="flex gap-2"><Button variant="outline" onClick={()=>setReplacing(null)}>Cancel</Button><Button disabled={busy} onClick={()=>replacing&&void reorder(replacing,true)}>Start New Cart</Button></div></Modal>
  </main>;
}
