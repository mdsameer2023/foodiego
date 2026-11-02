import type { MetadataRoute } from 'next';
import { siteUrl,restaurantSlug } from '@/lib/seo';
export const revalidate=3600;
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const routes:MetadataRoute.Sitemap=[{url:siteUrl.href,changeFrequency:'daily',priority:1},{url:new URL('/restaurants',siteUrl).href,changeFrequency:'daily',priority:.9}];
  try{
    const response=await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:5000/api'}/restaurants/sitemap`,{next:{revalidate:3600},signal:AbortSignal.timeout(5000)});
    if(!response.ok)return routes;
    const body=await response.json() as {data:{id:string;name:string;updatedAt?:string}[]};
    return [...routes,...body.data.map(r=>({url:new URL(`/restaurant/${r.id}/${restaurantSlug(r.name)}`,siteUrl).href,...(r.updatedAt?{lastModified:new Date(r.updatedAt)}:{}),changeFrequency:'daily' as const,priority:.7}))];
  }catch{return routes;}
}
