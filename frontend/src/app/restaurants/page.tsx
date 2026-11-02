import { Suspense } from "react";
import { Discovery } from "@/components/restaurant/discovery";
import type { Metadata } from 'next';
export const metadata:Metadata={title:'Restaurants near you',description:'Search restaurants and dishes, compare menus and find food matching your budget and preferences.',alternates:{canonical:'/restaurants'},openGraph:{title:'Restaurants near you | FoodieGo',url:'/restaurants'}};
export default function Page() {
  return (
    <Suspense fallback={<div className="container skeleton h-96" />}>
      <Discovery />
    </Suspense>
  );
}
