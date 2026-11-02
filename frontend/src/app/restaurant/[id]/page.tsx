import { notFound } from "next/navigation";
import { RestaurantDetail } from "@/components/restaurant/restaurant-detail";
import type { Metadata } from 'next';
import { restaurantForPage,restaurantPath,restaurantStructuredData,jsonLd,siteUrl } from '@/lib/seo';
import { ApiError } from "@/services/api";

export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const restaurant=await restaurantForPage(id).catch(error=>{if(error instanceof ApiError&&error.status===404)return null;throw error;});
  if(!restaurant) notFound();
  const breadcrumb={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Restaurants',item:new URL('/restaurants',siteUrl).href},{'@type':'ListItem',position:2,name:restaurant.name,item:new URL(restaurantPath(restaurant),siteUrl).href}]};
  return <>{!restaurant.isSample&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(restaurantStructuredData(restaurant))}}/>}<script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(breadcrumb)}}/><RestaurantDetail restaurant={restaurant}/></>;
}
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
  const {id}=await params;
  try{const restaurant=await restaurantForPage(id);const description=`Explore ${restaurant.name}${restaurant.city?` in ${restaurant.city}`:''}: ${restaurant.cuisine}. View available dishes, current prices and restaurant details.`;
    return {title:restaurant.name,description,alternates:{canonical:restaurantPath(restaurant)},openGraph:{title:`${restaurant.name} | FoodieGo`,description,url:restaurantPath(restaurant),images:restaurant.images?.length?restaurant.images:undefined},twitter:{card:'summary_large_image',title:`${restaurant.name} | FoodieGo`,description},...(restaurant.isSample?{robots:{index:false,follow:true}}:{})};
  }catch{return {title:'Restaurant unavailable',robots:{index:false,follow:false}};}
}
