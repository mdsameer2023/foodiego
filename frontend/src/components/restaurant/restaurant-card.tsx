"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Clock3, Star } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { catalogService } from "@/services/catalog";
import type { Restaurant } from "@/types";
export function RestaurantCard({restaurant:r,eager=false}:{restaurant:Restaurant;eager?:boolean}) {
  const router=useRouter(); const client=useQueryClient(); const {data:user}=useAuth();
  const {data:favorites=[]}=useQuery({queryKey:["favorites"],queryFn:catalogService.favorites,enabled:!!user});
  const saved=favorites.some(item=>item.id===r.id);
  const mutation=useMutation({mutationFn:()=>saved?catalogService.removeFavorite(r.id):catalogService.addFavorite(r.id),onMutate:async()=>{await client.cancelQueries({queryKey:["favorites"]});const previous=client.getQueryData<Restaurant[]>(["favorites"]);client.setQueryData<Restaurant[]>(["favorites"],old=>saved?(old||[]).filter(item=>item.id!==r.id):[r,...(old||[])]);return {previous};},onError:(_error,_vars,context)=>client.setQueryData(["favorites"],context?.previous),onSettled:()=>client.invalidateQueries({queryKey:["favorites"]})});
  return <article className="restaurant-card">
    <div className="card-photo">
      <Link href={`/restaurant/${r.id}`} tabIndex={-1} aria-hidden="true" style={{position:"relative",display:"block",width:"100%",height:"100%"}}><Image src={r.image} alt="" fill loading={eager?"eager":"lazy"} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"/></Link>
      {r.offer&&<span className="photo-label">{r.offer}</span>}
      <button className={`favorite ${saved?"is-favorite":""}`} aria-label={`${saved?"Remove":"Save"} ${r.name} ${saved?"from":"to"} favorites`} onClick={()=>user?mutation.mutate():router.push("/login")}><Heart size={18} fill={saved?"currentColor":"none"}/></button>
      <span className="delivery-time"><Clock3 size={12}/>{r.minutes} min</span>
    </div>
    <div className="card-content">
      <div className="flex justify-between gap-2 items-center"><Link href={`/restaurant/${r.id}`}><h3>{r.name}</h3></Link><span className="rating">{r.rating.toFixed(1)} <Star size={11} fill="currentColor"/></span></div>
      <div className="card-meta"><span>{r.cuisine} · {r.veg?"Pure veg":r.hasVegetarianOptions?"Veg options":"Non-veg"}</span><span>₹{r.price} for two</span></div>
      <div className="card-bottom"><span className="red">⌖</span>{r.area}<span>{r.reviews} reviews · {r.isOpen?"Open":"Closed"}{r.isSample?" · Demo":""}</span></div>
    </div>
  </article>;
}
