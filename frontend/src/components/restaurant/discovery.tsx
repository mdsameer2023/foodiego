"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { catalogService } from "@/services/catalog";
import { RestaurantCard } from "./restaurant-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useStore } from "@/store/use-store";

const cuisines=["Biryani","Pizza","Burgers","North Indian","South Indian","Chinese","Momos","Rolls","Sandwiches","Desserts","Ice Cream","Healthy Food","Healthy","Japanese"];
export function Discovery({favoritesOnly=false}:{favoritesOnly?:boolean}) {
  const params=useSearchParams(); const router=useRouter(); const pathname=usePathname();
  const auth=useAuth(); const user=auth.data;
  const location=useStore(s=>s.location);
  const [search,setSearch]=useState(params.get("q")||"");
  const [debounced,setDebounced]=useState(search);
  const [mobileFilters,setMobileFilters]=useState(false);
  const [recent,setRecent]=useState<string[]>([]);
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(search),300);return ()=>clearTimeout(timer);},[search]);
  useEffect(()=>{if(debounced===(params.get("q")||""))return;const next=new URLSearchParams(params.toString());if(debounced)next.set("q",debounced);else next.delete("q");next.delete("page");router.replace(`${pathname}?${next}`);},[debounced,params,pathname,router]);
  const setParam=(key:string,value:string)=>{const next=new URLSearchParams(params.toString());if(value)next.set(key,value);else next.delete(key);next.delete("page");router.push(`${pathname}?${next}`);};
  const query=Object.fromEntries(params.entries());
  if(query.q) {query.search=query.q;delete query.q;}
  if(query.veg) {query.pureVegetarian=query.veg;delete query.veg;}
  if(query.fast) {query.deliveryMax="30";delete query.fast;}
  if(query.price) {query.priceMax=query.price;delete query.price;}
  delete query.view;
  if(!query.city&&!query.lat&&!query.lng) query.city=location.includes(",")?location.split(",").at(-1)?.trim()||"Kolkata":location;
  const listing=useQuery({queryKey:["restaurants",query],queryFn:()=>catalogService.list({...query,limit:9}),enabled:!favoritesOnly,staleTime:30_000});
  const favorites=useQuery({queryKey:["favorites"],queryFn:catalogService.favorites,enabled:favoritesOnly&&!!user});
  const suggestions=useQuery({queryKey:["suggestions",debounced],queryFn:()=>catalogService.suggestions(debounced),enabled:debounced.length>=2&&!favoritesOnly,staleTime:60_000});
  const data=favoritesOnly?favorites.data:listing.data?.data;
  const pending=favoritesOnly?favorites.isPending:listing.isPending;
  const error=favoritesOnly?favorites.isError:listing.isError;
  const page=Number(params.get("page")||1);
  const toggle=(key:string,value="true")=>setParam(key,params.get(key)===value?"":value);
  const filters=[{key:"ratingMin",value:"4",label:"4.0+"},{key:"ratingMin",value:"4.5",label:"4.5+"},{key:"pureVegetarian",value:"true",label:"Pure veg"},{key:"vegetarian",value:"true",label:"Veg options"},{key:"deliveryMax",value:"30",label:"Under 30 min"},{key:"offers",value:"true",label:"Offers"},{key:"openNow",value:"true",label:"Open now"}];
  return <main className="container page-space">
    <div className="breadcrumb">Home / {favoritesOnly?"Favorites":"Restaurants"}</div>
    <span className="eyebrow red">YOUR NEXT FAVOURITE IS HERE</span>
    <h1 className="page-title">{favoritesOnly?"Saved for your next craving.":"Good food, close to home."}</h1>
    <p className="muted mb-7">Explore local kitchens, familiar favourites, and a little something new.</p>
    {favoritesOnly&&auth.isPending?<div className="skeleton h-72 rounded-2xl"/>:favoritesOnly&&!user?<div className="empty-state"><h2>Log in to see your favorites</h2><Button asChild><Link href="/login">Log in</Link></Button></div>:<>
    {!favoritesOnly&&<>
      <div className="discovery-search"><Search size={20}/><input aria-label="Search restaurants or food" value={search} onFocus={()=>{try{setRecent(JSON.parse(localStorage.getItem("foodiego-recent-searches")||"[]"));}catch{setRecent([]);}}} onKeyDown={e=>{if(e.key==="Enter"&&search.trim()){const next=[search.trim(),...recent.filter(item=>item!==search.trim())].slice(0,5);localStorage.setItem("foodiego-recent-searches",JSON.stringify(next));setRecent(next);setParam("q",search.trim());}}} onChange={e=>setSearch(e.target.value)} placeholder="Search restaurants, cuisines or dishes"/>{search&&<button aria-label="Clear search" onClick={()=>setSearch("")}><X size={18}/></button>}</div>
      {!search&&recent.length>0&&<div className="filter-row" aria-label="Recent searches">{recent.map(item=><button className="chip" key={item} onClick={()=>setSearch(item)}>{item}</button>)}</div>}
      {search.length>=2&&suggestions.data&&<div className="notice mb-4" role="listbox">
        {suggestions.data.restaurants.map(s=><Link className="chip" key={s.id} href={`/restaurant/${s.id}`}>{s.name}</Link>)}
        {suggestions.data.foods.map(s=><Link className="chip" key={s.id} href={`/restaurant/${s.restaurantId}?search=${encodeURIComponent(s.name)}`}>{s.name}</Link>)}
        {suggestions.data.cuisines.map(s=><button className="chip" key={s} onClick={()=>setParam("cuisine",s)}>{s}</button>)}
      </div>}
      <button className="chip mobile-filter-trigger" onClick={()=>setMobileFilters(true)}><SlidersHorizontal size={17}/> Filters</button>
      <div className={`discovery-toolbar ${mobileFilters?"filters-open":""}`}>
        <div className="filter-row"><button className="chip mobile-filter-close" onClick={()=>setMobileFilters(false)}>Close <X size={16}/></button><span className="filter-label"><SlidersHorizontal size={17}/> Filters</span>
          {filters.map(f=><button className={`chip ${params.get(f.key)===f.value?"selected":""}`} key={f.label} aria-pressed={params.get(f.key)===f.value} onClick={()=>toggle(f.key,f.value)}>{f.label}</button>)}
          <select aria-label="Cuisine" value={params.get("cuisine")||""} onChange={e=>setParam("cuisine",e.target.value)}><option value="">All cuisines</option>{cuisines.map(c=><option key={c}>{c}</option>)}</select>
          <select aria-label="Price for two" value={params.get("priceMax")||""} onChange={e=>setParam("priceMax",e.target.value)}><option value="">Any price</option><option value="400">Under ₹400</option><option value="600">Under ₹600</option><option value="800">Under ₹800</option></select>
          <input aria-label="City" placeholder="City" value={params.get("city")||""} onChange={e=>setParam("city",e.target.value)}/>
          <input aria-label="Area" placeholder="Area" value={params.get("area")||""} onChange={e=>setParam("area",e.target.value)}/>
          <button className="chip" onClick={()=>router.push(pathname)}>Clear all</button>
        </div>
        <label className="sort-label">Sort by <select value={params.get("sort")||"recommended"} onChange={e=>setParam("sort",e.target.value)}><option value="recommended">Recommended</option><option value="rating">Highest rated</option><option value="price">Lowest price</option><option value="priceDesc">Highest price</option><option value="time">Fastest delivery</option><option value="reviews">Most reviewed</option><option value="name">Name A–Z</option></select></label>
      </div>
      <div className="filter-row mb-4">{[...params.entries()].filter(([k])=>!["page","view","q","sort"].includes(k)).map(([k,v])=><button className="chip selected" key={k} onClick={()=>setParam(k,"")}>{k}: {v} <X size={13}/></button>)}</div>
    </>}
    <div className="results-heading"><h2>{favoritesOnly?"Your favourites":params.get("cuisine")||"Restaurants near you"}</h2><span className="muted">{favoritesOnly?data?.length??0:listing.data?.meta.total??0} restaurants</span></div>
    {pending?<div className="restaurant-grid">{[1,2,3].map(i=><div key={i} className="skeleton h-72 rounded-2xl"/>)}</div>:error?<div className="empty-state"><h2>Couldn’t load restaurants.</h2><Button onClick={()=>favoritesOnly?favorites.refetch():listing.refetch()}>Try again</Button></div>:data?.length?<><div className="restaurant-grid">{data.map((r,index)=><RestaurantCard key={r.id} restaurant={r} eager={index<3}/>)}</div>{!favoritesOnly&&listing.data&&listing.data.meta.pages>1&&<div className="text-center mt-8 flex justify-center gap-3"><Button variant="outline" disabled={page<=1} onClick={()=>setParam("page",String(page-1))}>Previous</Button><span className="self-center">{page} / {listing.data.meta.pages}</span><Button variant="outline" disabled={page>=listing.data.meta.pages} onClick={()=>setParam("page",String(page+1))}>Next</Button></div>}</>:<div className="empty-state"><Search size={36}/><h2>{favoritesOnly?"No favorites yet.":"No restaurants match your search."}</h2><Button onClick={()=>router.push(pathname)}>Reset filters</Button></div>}
    </>}
  </main>;
}
