"use client";
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
export default function Page() {
  const {data:user,isPending}=useAuth(),router=useRouter();
  useEffect(()=>{if(isPending)return;const target=user?.role==='ADMIN'?'/admin':user?.role==='RESTAURANT_OWNER'?'/restaurant-dashboard':user?.role==='DELIVERY_PARTNER'?'/delivery-dashboard':user?'/orders':'/login?next=/dashboard';router.replace(target);},[user,isPending,router]);
  return <main className="container page-space"><p>Opening your workspace…</p><Link href="/">Back to FoodieGo</Link></main>;
}
