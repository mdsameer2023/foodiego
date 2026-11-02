import { api } from './api';
export type FoodRecommendation={id:string;restaurantId:string;restaurantName:string;name:string;image:string;pricePaise:number;rating:number;reviewCount:number;deliveryMinutes:number;vegetarian:boolean;cuisines:string[];reason:string;href:string};
export type RecommendationRequest={message?:string;city:string;maxPrice?:number;dietary?:'any'|'vegetarian'|'non-vegetarian';personalize?:boolean;preferredCuisines?:string[];section?:'recommended'|'similar'|'frequent'|'budget'|'trending'|'discover';restaurantId?:string;limit?:number};
export type RecommendationResponse={mode:'catalog'|'gemini'|'fallback';message:string;cards:FoodRecommendation[];frequentlyOrderedCuisines:string[];personalized:boolean;retentionMinutes:number;disclaimer:string};
export const aiService={
  chat:(input:RecommendationRequest,signal?:AbortSignal)=>api<RecommendationResponse>('/ai/chat',{method:'POST',body:JSON.stringify(input),signal}),
  recommendations:(input:RecommendationRequest,signal?:AbortSignal)=>api<RecommendationResponse>('/ai/recommendations',{method:'POST',body:JSON.stringify(input),signal}),
};
export function selectedCity(location:string){return location.split(',').at(-1)?.trim()||'Kolkata';}
