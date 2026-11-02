"use client";
import Image from "next/image";
import { RecommendationsEntry } from '@/components/ai/recommendations-entry';
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star,Clock3,MapPin,ShoppingBag,ArrowRight,Search,Heart } from "lucide-react";
import { DietaryMark } from "@/components/food/dietary-mark";
import { money } from "@/lib/data";
import { catalogService } from "@/services/catalog";
import { useHydrated } from "@/hooks/use-hydrated";
import { useAuth } from "@/hooks/use-auth";
import type { MenuItem,Restaurant } from "@/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useCart } from "@/hooks/use-cart";
import { ApiError } from "@/services/api";


export function RestaurantDetail({restaurant:r}:{restaurant:Restaurant}) {
  const params=useSearchParams();
  const router=useRouter();const client=useQueryClient();const {data:user}=useAuth();const hydrated=useHydrated();
  const cart=useCart();
  const [selected,setSelected]=useState<MenuItem|null>(null);const [chosen,setChosen]=useState<Record<string,string[]>>({});const [conflict,setConflict]=useState(false);const [message,setMessage]=useState("");const [cartError,setCartError]=useState("");
  const [search,setSearch]=useState(params.get("search")||"");const [diet,setDiet]=useState("");const [popular,setPopular]=useState(false);const [category,setCategory]=useState("");const [sort,setSort]=useState("name");const [page,setPage]=useState(1);
  const [reviewSort,setReviewSort]=useState("newest");const [rating,setRating]=useState(5);const [comment,setComment]=useState("");
  const [reviewPage,setReviewPage]=useState(1);
  const [editingId,setEditingId]=useState("");const [editRating,setEditRating]=useState(5);const [editComment,setEditComment]=useState("");
  const galleryImages=[...new Set(r.images?.length?r.images:[r.image])];
  const [activeImage,setActiveImage]=useState(galleryImages[0]);
  const categories=useQuery({queryKey:["menu-categories",r.id],queryFn:()=>catalogService.menuCategories(r.id)});
  const menu=useQuery({queryKey:["menu-items",r.id,category,search,diet,popular,sort,page],queryFn:()=>catalogService.menuItems(r.id,{category,search,vegetarian:diet||undefined,popular:popular?"true":undefined,sort,page,limit:20})});
  useEffect(()=>{
    if(!menu.data || !window.location.hash.startsWith("#dish-"))return;
    const frame=requestAnimationFrame(()=>document.getElementById(window.location.hash.slice(1))?.scrollIntoView({block:"center"}));
    return ()=>cancelAnimationFrame(frame);
  },[menu.data]);
  const reviews=useQuery({queryKey:["reviews",r.id,reviewSort,reviewPage],queryFn:()=>catalogService.reviews(r.id,reviewSort,reviewPage)});
  const {data:favorites=[]}=useQuery({queryKey:["favorites"],queryFn:catalogService.favorites,enabled:!!user});
  const saved=favorites.some(item=>item.id===r.id);
  const favorite=useMutation({mutationFn:()=>saved?catalogService.removeFavorite(r.id):catalogService.addFavorite(r.id),onMutate:async()=>{await client.cancelQueries({queryKey:["favorites"]});const previous=client.getQueryData<Restaurant[]>(["favorites"]);client.setQueryData<Restaurant[]>(["favorites"],old=>saved?(old||[]).filter(x=>x.id!==r.id):[r,...(old||[])]);return {previous};},onError:(_e,_v,c)=>client.setQueryData(["favorites"],c?.previous),onSettled:()=>client.invalidateQueries({queryKey:["favorites"]})});
  const submitReview=useMutation({mutationFn:()=>catalogService.createReview(r.id,rating,comment),onSuccess:()=>{setComment("");client.invalidateQueries({queryKey:["reviews",r.id]});client.invalidateQueries({queryKey:["restaurants"]});}});
  const deleteReview=useMutation({mutationFn:(id:string)=>catalogService.deleteReview(id),onSuccess:()=>{client.invalidateQueries({queryKey:["reviews",r.id]});client.invalidateQueries({queryKey:["restaurants"]});}});
  const editReview=useMutation({mutationFn:()=>catalogService.updateReview(editingId,editRating,editComment),onSuccess:()=>{setEditingId("");client.invalidateQueries({queryKey:["reviews",r.id]});client.invalidateQueries({queryKey:["restaurants"]});}});
  const selections=selected?.customizationOptions?.flatMap(group=>chosen[group.name]?.length?[{group:group.name,options:chosen[group.name]}]:[])||[];
  const extra=selected?.customizationOptions?.reduce((sum,group)=>sum+(chosen[group.name]||[]).reduce((total,name)=>total+(group.options.find(option=>option.name===name)?.price||0),0),0)||0;
  const valid=selected?.customizationOptions?.every(group=>{const count=chosen[group.name]?.length||0;return count>=(group.minSelections??(group.required?1:0)) && count<=(group.maxSelections??1);})??true;
  const commit=async()=>{if(!selected||!valid)return;setCartError('');try{const added=await cart.add({...selected,restaurantName:r.name},selections);if(!added){setConflict(true);return;}setMessage(`${selected.name} added to your cart`);setSelected(null);setConflict(false);}catch(error){if(error instanceof ApiError && error.code==='CART_RESTAURANT_CONFLICT')setConflict(true);else setCartError(error instanceof Error?error.message:'Could not add item');}};
  return <main className="container page-space">
    <div className="breadcrumb"><Link href="/restaurants">Restaurants</Link> / {r.name}</div>
    <div className="detail-cover"><Image src={activeImage} alt={`${r.name} restaurant photo`} fill priority sizes="100vw"/><span>{r.isSample?"Demo restaurant":"Restaurant gallery"}</span></div>
    <section className="restaurant-gallery" aria-label="Restaurant photo gallery"><h2>Photos</h2><div className="restaurant-gallery-list">{galleryImages.map((src,index)=><button key={src} type="button" className={`restaurant-gallery-thumb ${activeImage===src?"active":""}`} onClick={()=>setActiveImage(src)} aria-label={`View restaurant photo ${index+1}`} aria-pressed={activeImage===src}><Image src={src} alt={`${r.name} photo ${index+1}`} fill sizes="96px"/></button>)}</div></section>
    <section className="restaurant-intro"><div><span className="eyebrow red">{r.area.toUpperCase()} · {r.city?.toUpperCase()}</span><h1 className="page-title">{r.name}</h1><p className="muted">{r.cuisine} · ₹{r.price} for two · {r.veg?"Pure vegetarian":"Vegetarian and non-vegetarian options"}</p><div className="restaurant-facts"><span><Clock3 size={17}/>{r.minutes} min</span><span><MapPin size={17}/>{r.address||r.area}</span><span className={r.isOpen?"green":"red"}>{r.isOpen?"Open":"Closed"} · {r.openingHours}</span></div><p className="muted mt-3">{r.description}</p></div><div className="rating-large"><strong>{r.rating.toFixed(1)} <Star size={19} fill="currentColor"/></strong><span>{r.reviews} reviews</span><button className={`favorite ${saved?"is-favorite":""}`} aria-label={saved?"Remove from favorites":"Add to favorites"} onClick={()=>user?favorite.mutate():router.push("/login")}><Heart fill={saved?"currentColor":"none"}/></button></div></section>
    {r.offer&&<div className="offer-strip"><span>✦</span><div><strong>{r.offer}</strong><p>Offer terms may vary.</p></div></div>}
    <div className="menu-layout"><aside className="menu-sidebar"><h3>On the menu</h3><button className="chip" onClick={()=>{setCategory("");setPage(1);}}>All dishes</button>{categories.data?.map(c=><button className={`chip ${category===c.id?"selected":""}`} key={c.id} onClick={()=>{setCategory(c.id);setPage(1);}}>{c.name}</button>)}<a href="#reviews">Customer reviews</a><div className="notice">Your cart can contain items from one restaurant at a time.</div></aside>
      <div><div className="menu-controls"><div className="discovery-search"><Search size={18}/><input aria-label="Search menu" placeholder="Search this menu" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div><select aria-label="Dietary menu" value={diet} onChange={e=>{setDiet(e.target.value);setPage(1);}}><option value="">All dishes</option><option value="true">Vegetarian</option><option value="false">Non-vegetarian</option></select><label className="flex items-center gap-2 text-sm whitespace-nowrap"><input type="checkbox" checked={popular} onChange={e=>{setPopular(e.target.checked);setPage(1);}}/>Popular</label><select aria-label="Sort menu" value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Name</option><option value="price">Price: low to high</option><option value="priceDesc">Price: high to low</option></select></div>
      <p aria-live="polite" className="green text-sm mb-3">{message}</p>
      {menu.isPending&&<div className="skeleton h-72 rounded-2xl"/>}{menu.isError&&<div className="notice">Could not load this menu. <Button variant="outline" onClick={()=>menu.refetch()}>Try again</Button></div>}
      {menu.data?.data.map(i=><article className="menu-item" id={`dish-${i.id}`} key={i.id}><div><DietaryMark veg={i.veg}/>{i.isPopular&&<span className="bestseller">★ Popular</span>}<h3>{i.name}</h3><strong>{money(i.price)}</strong><p>{i.description}</p><small>{i.category}</small></div><div className="menu-item-photo"><Image src={i.image||r.image} alt={i.name} fill sizes="160px"/><Button className="menu-add" variant="outline" onClick={()=>{setSelected(i);setChosen({});setConflict(false);setCartError('');}}>ADD +</Button></div></article>)}
      {menu.data&&!menu.data.data.length&&<div className="empty-state">No dishes match your search.</div>}
      {menu.data&&menu.data.meta.pages>1&&<div className="flex gap-3 justify-center mt-6"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</Button><span>{page} / {menu.data.meta.pages}</span><Button variant="outline" disabled={page>=menu.data.meta.pages} onClick={()=>setPage(page+1)}>Next</Button></div>}
      <section id="reviews" className="review-section"><h2>Customer reviews</h2><p className="muted mb-4">Any signed-in customer may leave one review per restaurant. A purchase is not required.</p><select aria-label="Sort reviews" value={reviewSort} onChange={e=>{setReviewSort(e.target.value);setReviewPage(1);}}><option value="newest">Newest</option><option value="rating">Highest rated</option></select>
      {reviews.isPending&&<p>Loading reviews...</p>}{reviews.isError&&<p>Could not load reviews.</p>}{reviews.data?.data.map(review=><div className="review" key={review.id}><strong>{review.userName}</strong><span className="green"> ★ {review.rating}/5</span><small> {new Date(review.createdAt).toLocaleDateString()}</small><p>{review.comment}</p>{user&&user.id===review.userId&&<><button className="chip" onClick={()=>{setEditingId(review.id);setEditRating(review.rating);setEditComment(review.comment);}}>Edit</button><button className="chip" onClick={()=>deleteReview.mutate(review.id)}>Delete</button></>}{editingId===review.id&&<form onSubmit={e=>{e.preventDefault();editReview.mutate();}}><select aria-label="Edit rating" value={editRating} onChange={e=>setEditRating(Number(e.target.value))}>{[5,4,3,2,1].map(n=><option value={n} key={n}>{n} stars</option>)}</select><textarea aria-label="Edit review" className="w-full border rounded-lg p-3 mt-3" value={editComment} onChange={e=>setEditComment(e.target.value)} minLength={3} maxLength={1000} required/><Button disabled={editReview.isPending}>Save review</Button><button className="chip" type="button" onClick={()=>setEditingId("")}>Cancel</button>{editReview.isError&&<p className="red">{editReview.error.message}</p>}</form>}</div>)}{reviews.data?.data.length===0&&<p className="muted">No reviews yet.</p>}{reviews.data&&reviews.data.meta.pages>1&&<div className="flex gap-3 justify-center"><Button variant="outline" disabled={reviewPage<=1} onClick={()=>setReviewPage(reviewPage-1)}>Previous reviews</Button><Button variant="outline" disabled={reviewPage>=reviews.data.meta.pages} onClick={()=>setReviewPage(reviewPage+1)}>Next reviews</Button></div>}
      {user?<form onSubmit={e=>{e.preventDefault();submitReview.mutate();}} className="mt-5"><h3>Write a review</h3><select aria-label="Your rating" value={rating} onChange={e=>setRating(Number(e.target.value))}>{[5,4,3,2,1].map(n=><option value={n} key={n}>{n} stars</option>)}</select><textarea aria-label="Your review" value={comment} onChange={e=>setComment(e.target.value)} minLength={3} maxLength={1000} required className="w-full border rounded-lg p-3 mt-3"/><Button disabled={submitReview.isPending} className="mt-3">Submit review</Button>{submitReview.isError&&<p className="red">{submitReview.error.message}</p>}</form>:<Link href="/login">Log in to leave a review</Link>}</section>
      </div></div>
    {hydrated&&cart.count>0&&<Link className="sticky-cart" href="/cart"><ShoppingBag size={19}/>{cart.count} items in your cart <span className="ml-auto">View cart <ArrowRight size={18}/></span></Link>}
    <RecommendationsEntry key={r.id} restaurantId={r.id}/>
    <Modal open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}} title={selected?.name||"Customize your dish"}>
      {selected?.customizationOptions?.length?selected.customizationOptions.map(group=><fieldset key={group.name} className="mb-4"><legend className="font-semibold mb-2">{group.name} {(group.required || (group.minSelections??0)>0)&&<span className="red">Required</span>}</legend>{group.options.map(option=>{const checked=(chosen[group.name]||[]).includes(option.name);const multi=(group.maxSelections??1)>1;return <label key={option.name} className="radio-row"><input type={multi?'checkbox':'radio'} name={group.name} checked={checked} onChange={()=>setChosen(previous=>({...previous,[group.name]:multi?(checked?(previous[group.name]||[]).filter(name=>name!==option.name):[...(previous[group.name]||[]),option.name]):[option.name]}))}/>{option.name}<span className="ml-auto">{option.price?`+ ${money(option.price)}`:'Included'}</span></label>;})}</fieldset>):<p className="muted mb-4">No customizations for this dish.</p>}
      {cartError&&<p role="alert" className="red">{cartError}</p>}
      {conflict?<div className="notice mt-4"><strong>Your cart contains items from another restaurant. Would you like to clear your cart and add items from this restaurant?</strong><div className="flex gap-2 mt-3"><Button type="button" variant="outline" onClick={()=>setConflict(false)}>Cancel</Button><Button type="button" onClick={async()=>{await cart.clear();await commit();}}>Start New Cart</Button></div></div>:<Button className="w-full mt-5" disabled={!valid||cart.busy} onClick={commit}>Add to cart · {money((selected?.price||0)+extra)}</Button>}
    </Modal>
  </main>;
}
