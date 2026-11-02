'use client';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { deliveryService,type Delivery } from '@/services/deliveries';
import { Button } from '@/components/ui/button';

export function PartnerDeliveries(){
  const {data:user,isPending}=useAuth(),client=useQueryClient(),watch=useRef<number|null>(null);
  const [codes,setCodes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[sharing,setSharing]=useState('');
  const query=useQuery({queryKey:['my-deliveries'],queryFn:deliveryService.mine,enabled:user?.role==='DELIVERY_PARTNER',refetchInterval:15000});
  useEffect(()=>()=>{if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);},[]);
  async function action(row:Delivery,verb:'accept'|'reject'|'pickup'|'start'|'complete'){
    setBusy(row.id);setError('');try{await deliveryService.action(row.id,verb,codes[row.id]);await client.invalidateQueries({queryKey:['my-deliveries']});if(verb==='complete')await stop(row);}catch(cause){setError(cause instanceof Error?cause.message:'Could not update delivery');}finally{setBusy('');}
  }
  async function share(row:Delivery){
    if(!navigator.geolocation){setError('This browser does not support location sharing.');return;}
    setBusy(row.id);setError('');
    try{
      const initial=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:20000}));
      await deliveryService.action(row.id,'tracking/start');
      await deliveryService.location(row.id,initial.coords.latitude,initial.coords.longitude);
      watch.current=navigator.geolocation.watchPosition(position=>{void deliveryService.location(row.id,position.coords.latitude,position.coords.longitude).catch(cause=>setError(cause instanceof Error?cause.message:'Location update failed'));},cause=>{setError(cause.message);if(cause.code===1)void stop(row);},{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
      setSharing(row.id);await client.invalidateQueries({queryKey:['my-deliveries']});
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not start sharing');}finally{setBusy('');}
  }
  async function stop(row:Delivery){
    if(watch.current!==null){navigator.geolocation.clearWatch(watch.current);watch.current=null;}setSharing('');
    try{await deliveryService.action(row.id,'tracking/stop');await client.invalidateQueries({queryKey:['my-deliveries']});}catch(cause){setError(cause instanceof Error?cause.message:'Could not stop sharing');}
  }
  if(isPending)return <main className="container page-space"><div className="skeleton h-96 rounded-2xl"/></main>;
  if(!user)return <main className="container empty-state"><h1>Log in to view deliveries</h1><Button asChild><Link href="/login?next=/deliveries">Log in</Link></Button></main>;
  if(user.role!=='DELIVERY_PARTNER')return <main className="container empty-state"><h1>Partner access required</h1></main>;
  return <main className="container page-space"><span className="eyebrow red">FOODIEGO DELIVERY</span><h1 className="page-title">Assigned deliveries</h1><p className="muted mb-6">Location sharing starts only when you choose it, and stops after delivery.</p>{error&&<p role="alert" className="notice red mb-4">{error}</p>}{query.isPending&&<div className="skeleton h-64 rounded-2xl"/>}{query.isError&&<p role="alert">{query.error.message}</p>}{query.data?.length===0&&<p>No active deliveries right now.</p>}
    <div className="grid gap-5">{query.data?.map(row=><section key={row.id} className="panel p-5"><h2 className="text-xl font-semibold">Delivery {row.id.slice(-6).toUpperCase()}</h2><p className="muted mb-4">{row.assignmentStatus.replaceAll('_',' ')} · Assigned {new Date(row.assignedAt).toLocaleString('en-IN')}</p>{row.restaurant&&<div className="mb-4"><h3 className="font-semibold">Pickup · {row.restaurant.name}</h3><p className="muted text-sm">{row.restaurant.address}, {row.restaurant.city}</p><a className="chip mt-2" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${row.restaurant.address}, ${row.restaurant.city}`)}`} target="_blank" rel="noopener noreferrer">Navigate to pickup</a></div>}{row.order&&<div className="mb-4"><h3 className="font-semibold">{row.order.orderNumber} · Delivery</h3><p>{row.order.deliveryAddressSnapshot.fullName}</p><p className="muted text-sm">{row.order.deliveryAddressSnapshot.addressLine1}, {row.order.deliveryAddressSnapshot.city} {row.order.deliveryAddressSnapshot.postalCode}</p>{row.order.deliveryInstructions&&<p className="notice mt-2">{row.order.deliveryInstructions}</p>}<ul className="text-sm my-2">{row.order.items.map((item,index)=><li key={index}>{item.quantity} × {item.name}{item.specialInstructions&&` · ${item.specialInstructions}`}</li>)}</ul><a className="chip" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${row.order.deliveryAddressSnapshot.addressLine1}, ${row.order.deliveryAddressSnapshot.city}, ${row.order.deliveryAddressSnapshot.postalCode}`)}`} target="_blank" rel="noopener noreferrer">Navigate to customer</a></div>}<div className="flex flex-wrap gap-2">{row.assignmentStatus==='OFFERED'&&<><Button disabled={busy===row.id} onClick={()=>void action(row,'accept')}>Accept</Button><Button variant="outline" disabled={busy===row.id} onClick={()=>void action(row,'reject')}>Reject</Button></>}{row.assignmentStatus==='ACCEPTED'&&<Button disabled={busy===row.id} onClick={()=>void action(row,'pickup')}>Mark picked up</Button>}{row.assignmentStatus==='PICKED_UP'&&<Button disabled={busy===row.id} onClick={()=>void action(row,'start')}>Start delivery</Button>}{row.assignmentStatus==='ON_THE_WAY'&&<><input aria-label="Customer delivery code" placeholder="6-digit customer code" inputMode="numeric" maxLength={6} className="border rounded-lg p-2" value={codes[row.id]||''} onChange={e=>setCodes(previous=>({...previous,[row.id]:e.target.value.replace(/\D/g,'')}))}/><Button disabled={busy===row.id||!/^\d{6}$/.test(codes[row.id]||'')} onClick={()=>void action(row,'complete')}>Verify & deliver</Button></>}{['ACCEPTED','PICKED_UP','ON_THE_WAY'].includes(row.assignmentStatus)&&(sharing===row.id?<Button variant="outline" onClick={()=>void stop(row)}>Stop sharing location</Button>:<Button variant="outline" disabled={busy===row.id} onClick={()=>void share(row)}>Share live location</Button>)}</div></section>)}</div>
  </main>;
}
