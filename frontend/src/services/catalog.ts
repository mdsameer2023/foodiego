import { api } from "./api";
import type { Restaurant, MenuItem } from "@/types";

type RemoteRestaurant = {id?:string;_id?:string;demoId?:string;name:string;description:string;cuisines:string[];images:string[];rating:number;reviewCount:number;averageDeliveryTime:number;priceForTwo:number;offer:string;hasVegetarianOptions:boolean;isPureVegetarian:boolean;isOpen:boolean;isSample:boolean;area:string;city:string;address:string;openingHours:string};
type RemoteItem = {id:string;_id?:string;demoId?:string;restaurantId:string;name:string;description:string;price:number;image:string;isVegetarian:boolean;isPopular:boolean;categoryId:string;customizationOptions?:Array<{name:string;required?:boolean;minSelections?:number;maxSelections?:number;options:Array<{name:string;price:number}>}>};
export type MenuCategory = {id:string;name:string};
type RemoteMenu = {categories:MenuCategory[];items:RemoteItem[]};
export type Paginated<T> = {data:T[];meta:{page:number;limit:number;total:number;pages:number}};
export type Review = {id:string;userId:string;userName:string;rating:number;comment:string;createdAt:string;updatedAt:string};
export type Suggestions = {restaurants:{id:string;name:string}[];foods:{id:string;restaurantId:string;name:string}[];cuisines:string[]};
export function localImage(value: string) { try { const path = new URL(value).pathname; return path.startsWith("/images/") ? path : value; } catch { return value; } }
function restaurant(row: RemoteRestaurant): Restaurant { return {id:row.id || row._id || row.demoId || "",name:row.name,description:row.description,cuisine:row.cuisines.join(", "),image:localImage(row.images[0] || "/images/biryani.jpg"),images:row.images.map(localImage),rating:row.rating,reviews:row.reviewCount,minutes:row.averageDeliveryTime,price:row.priceForTwo,offer:row.offer,veg:row.isPureVegetarian,hasVegetarianOptions:row.hasVegetarianOptions,isOpen:row.isOpen,isSample:row.isSample,area:row.area,city:row.city,address:row.address,openingHours:row.openingHours}; }
function item(row: RemoteItem,categories:MenuCategory[]): MenuItem { return {id:row.id || row._id || row.demoId || '',demoId:row.demoId,restaurantId:row.restaurantId,name:row.name,description:row.description,price:row.price,image:localImage(row.image),veg:row.isVegetarian,isPopular:row.isPopular,category:categories.find(c=>c.id===row.categoryId)?.name || "Menu",customizationOptions:row.customizationOptions||[]}; }
function qs(input:Record<string,string|number|boolean|undefined>) { const params=new URLSearchParams(); Object.entries(input).forEach(([key,value])=>{if(value!==undefined && value!=="") params.set(key,String(value));}); return params.toString(); }
export const catalogService = {
  list: async (query:Record<string,string|number|boolean|undefined> = {}):Promise<Paginated<Restaurant>> => {
    const response=await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}/restaurants?${qs(query)}`,{credentials:"include",cache:"no-store",signal:AbortSignal.timeout(8000)});
    const body=await response.json();
    if(!response.ok) throw new Error(body.error?.message || "Could not load restaurants");
    return {data:(body.data as RemoteRestaurant[]).map(restaurant),meta:body.meta};
  },
  get: async (id:string):Promise<Restaurant> => restaurant(await api<RemoteRestaurant>(`/restaurants/${encodeURIComponent(id)}`)),
  menu: async (id:string):Promise<MenuItem[]> => { const result=await api<RemoteMenu>(`/restaurants/${encodeURIComponent(id)}/menu`);return result.items.map(row=>item(row,result.categories)); },
  menuCategories: (id:string)=>api<MenuCategory[]>(`/restaurants/${encodeURIComponent(id)}/menu/categories`),
  menuItems: async(id:string,query:Record<string,string|number|boolean|undefined> = {}):Promise<Paginated<MenuItem>>=>{
    const categories=await api<MenuCategory[]>(`/restaurants/${encodeURIComponent(id)}/menu/categories`);
    const response=await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}/restaurants/${encodeURIComponent(id)}/menu/items?${qs(query)}`,{credentials:"include",cache:"no-store"});
    const body=await response.json();
    if(!response.ok) throw new Error(body.error?.message || "Could not load menu");
    return {data:(body.data as RemoteItem[]).map(row=>item(row,categories)),meta:body.meta};
  },
  reviews: async (id:string,sort="newest",page=1):Promise<Paginated<Review>>=>{
    const response=await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}/restaurants/${encodeURIComponent(id)}/reviews?sort=${encodeURIComponent(sort)}&page=${page}`,{credentials:"include",cache:"no-store"});
    const body=await response.json();
    if(!response.ok) throw new Error(body.error?.message || "Could not load reviews");
    return body as Paginated<Review>;
  },
  suggestions: (q:string)=>api<Suggestions>(`/restaurants/search?q=${encodeURIComponent(q)}`),
  cuisines: ()=>api<{name:string;count:number}[]>("/restaurants/cuisines"),
  trending: async():Promise<MenuItem[]>=>{const rows=await api<RemoteItem[]>("/menu-items/trending");return rows.map(row=>item(row,[]));},
  favorites: async()=>{const rows=await api<{restaurant:RemoteRestaurant}[]>("/users/favorites");return rows.map(row=>restaurant(row.restaurant));},
  addFavorite: (restaurantId:string)=>api("/users/favorites",{method:"POST",body:JSON.stringify({restaurantId})}),
  removeFavorite: (restaurantId:string)=>api(`/users/favorites/${encodeURIComponent(restaurantId)}`,{method:"DELETE"}),
  createReview: (id:string,rating:number,comment:string)=>api(`/restaurants/${encodeURIComponent(id)}/reviews`,{method:"POST",body:JSON.stringify({rating,comment})}),
  updateReview: (id:string,rating:number,comment:string)=>api(`/reviews/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({rating,comment})}),
  deleteReview: (id:string)=>api(`/reviews/${encodeURIComponent(id)}`,{method:"DELETE"}),
};
