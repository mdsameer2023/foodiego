"use client";
import Image from "next/image";
import { RecommendationsEntry } from './ai/recommendations-entry';
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Bike,
  ShieldCheck,
  Sparkles,
  Clock3,
  ChevronRight,
  ChevronLeft,
  Tag,
} from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { categories, photos } from "@/lib/data";
import { catalogService } from "@/services/catalog";
import { RestaurantCard } from "@/components/restaurant/restaurant-card";
import { Button } from "@/components/ui/button";

export function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [foodLinkError,setFoodLinkError]=useState("");
  const categoriesRef=useRef<(HTMLDivElement|null)[]>([]);
  const { data: featured, isPending, isError } = useQuery({ queryKey: ["home-restaurants"], queryFn: ()=>catalogService.list({limit:6}), retry:1 });
  const {data:availableCuisines=[],isPending:cuisinesPending,isError:cuisinesError}=useQuery({queryKey:["cuisines"],queryFn:catalogService.cuisines,staleTime:60_000});
  const visibleCategories=categories.filter(c=>availableCuisines.some(row=>row.name===c.name));
  const categoryRows=[visibleCategories.filter((_,index)=>index%2===0),[
    {name:"Pasta",image:"/images/pasta.jpg"},
    {name:"French Fries",image:"/images/fries.jpg"},
    {name:"Pancakes",image:"/images/pancakes.jpg"},
    {name:"Coffee",image:"/images/coffee.jpg"},
  ]];

  useEffect(()=>{
    if(visibleCategories.length<2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    const rows=categoriesRef.current.filter((row):row is HTMLDivElement=>Boolean(row));
    const sequenceWidth=(row:HTMLDivElement)=>{
      const first=row.firstElementChild as HTMLElement|null;
      return first?first.getBoundingClientRect().width+parseFloat(getComputedStyle(row).columnGap||"0"):0;
    };
    rows.forEach(row=>{row.scrollLeft=sequenceWidth(row);});
    let frame=0,last=0,remainder=0;
    const move=(time:number)=>{
      const movement=Math.min(time-last,50)*0.035+remainder;
      const distance=Math.floor(movement);
      remainder=movement-distance;
      if(last)rows.forEach((row,index)=>{
        if(row.matches(":hover") || row.contains(document.activeElement))return;
        const width=sequenceWidth(row);
        if(!width)return;
        row.scrollLeft+=index===0?-distance:distance;
        if(index===0 && row.scrollLeft<=0)row.scrollLeft+=width;
        if(index===1 && row.scrollLeft>=width*2)row.scrollLeft-=width;
      });
      last=time;
      frame=requestAnimationFrame(move);
    };
    frame=requestAnimationFrame(move);
    return ()=>cancelAnimationFrame(frame);
  },[visibleCategories.length]);
  return (
    <>
      <main className="container">
        <section className="hero">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <span className="eyebrow">
              <span className="tiny-dot" /> A LITTLE CRAVING. A LOT OF
              HAPPINESS.
            </span>
            <h1>
              Your cravings.
              <br />
              Our <span>happy place.</span>
            </h1>
            <p>
              From your favourite comfort food to your next big
              <br className="desktop-break" /> discovery. Good food is always
              around the corner.
            </p>
            <form
              className="hero-search"
              onSubmit={(e) => {
                e.preventDefault();
                router.push(`/restaurants?q=${encodeURIComponent(query)}`);
              }}
            >
              <Search size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What are you craving today?"
                aria-label="What are you craving today?"
              />
              <button aria-label="Find food">
                <ArrowRight size={22} />
              </button>
            </form>
            <div className="hero-proof">
              <div className="avatar-stack">
                <span>😋</span>
                <span>👩🏽</span>
                <span>👨🏻</span>
              </div>
              <div>
                <strong>A whole city of good taste</strong>
                <small>Discover Kolkata, one delicious bite at a time</small>
              </div>
            </div>
          </motion.div>
          <div className="hero-art">
            <div className="hero-ring" />
            <Image
              className="hero-food"
              src={photos.biryani}
              alt="A generous bowl of fragrant biryani"
              fill
              priority
              sizes="(max-width: 380px) 215px, (max-width: 640px) 240px, (max-width: 1100px) 295px, (min-width: 1440px) 375px, 340px"
            />
            <div className="floating-note fresh-note">
              <span>🌿</span>
              <div>
                <strong>Fresh. Flavourful.</strong>
                <small>Made for your mood.</small>
              </div>
            </div>
            <div className="floating-note delivery-note">
              <span className="icon-bubble">
                <Bike size={25} />
              </span>
              <div>
                <strong>Happiness, delivered.</strong>
                <small>Your favourites, at your doorstep</small>
              </div>
            </div>
            <span className="art-star">✳</span>
          </div>
        </section>
        <div className="trust-strip">
          <span>
            <Bike />
            Fast & fresh delivery
          </span>
          <span>
            <ShieldCheck />
            Carefully picked restaurants
          </span>
          <span>
            <Tag />A little more value in every bite
          </span>
        </div>
        <section className="section">
          <SectionTitle
            eyebrow="FOLLOW YOUR CRAVINGS"
            title="What's on your mind?"
          />
          <div className="flex justify-end gap-2 mb-3"><button className="chip" aria-label="Previous categories" onClick={()=>categoriesRef.current.forEach(row=>row?.scrollBy({left:-350,behavior:"smooth"}))}><ChevronLeft size={18}/></button><button className="chip" aria-label="Next categories" onClick={()=>categoriesRef.current.forEach(row=>row?.scrollBy({left:350,behavior:"smooth"}))}><ChevronRight size={18}/></button></div>
          {cuisinesPending&&<div className="skeleton h-32 rounded-2xl"/>}
          {cuisinesError&&<p className="notice">Could not load cuisines.</p>}
          {foodLinkError&&<p className="notice" role="alert">{foodLinkError}</p>}
          {categoryRows.map((row,index)=>row.length>0&&(
            <div className="categories categories-auto" key={index} ref={element=>{categoriesRef.current[index]=element;}}>
              {Array.from({length:6},(_,copy)=>(
                <div className="category-sequence" key={copy} aria-hidden={copy===1?undefined:true}>
                  {row.map(c=>(
                    <Link href={`/restaurants?${index===0?"cuisine":"q"}=${encodeURIComponent(c.name)}`} className="category" key={c.name} tabIndex={copy===1?undefined:-1} onClick={index===0?undefined:async event=>{
                      event.preventDefault();
                      setFoodLinkError("");
                      try {
                        const result=await catalogService.suggestions(c.name);
                        const food=result.foods.find(item=>item.name.toLowerCase()===c.name.toLowerCase())||result.foods.find(item=>item.name.toLowerCase().includes(c.name.toLowerCase()));
                        if(!food)throw new Error(`${c.name} is currently unavailable.`);
                        router.push(`/restaurant/${food.restaurantId}?search=${encodeURIComponent(food.name)}#dish-${food.id}`);
                      } catch(error) {setFoodLinkError(error instanceof Error?error.message:"Could not open this dish. Please try again.");}
                    }}>
                      <div style={{position:"relative"}}><Image src={c.image} alt={c.name} fill sizes="140px"/></div>
                      <span>{c.name}</span>
                      <small className="muted">{index===0?`${availableCuisines.find(item=>item.name===c.name)?.count} restaurants`:"Explore dishes"}</small>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </section>
        <section className="promo-grid">
          <div className="promo promo-red">
            <div>
              <span className="eyebrow">YOUR FIRST BITE IS ON US. ALMOST.</span>
              <h2>
                Big cravings.
                <br />
                Bigger savings.
              </h2>
              <p>50% off your first demo order · up to ₹100</p>
              <Link href="/restaurants?offers=true">
                Use FIRSTBITE <ArrowUpRight size={17} />
              </Link>
            </div>
            <span className="promo-percent">
              50
              <small>
                %<br />
                OFF
              </small>
            </span>
          </div>
          <div className="promo promo-cream">
            <div>
              <span className="eyebrow">FRESH PICKS, FEEL-GOOD BITES</span>
              <h2>
                A little green.
                <br />A lot of good.
              </h2>
              <Link href="/restaurants?cuisine=Healthy">
                Find your fresh fix <ArrowRight size={17} />
              </Link>
            </div>
            <div className="promo-image">
              <Image
                src={photos.salad}
                alt="Fresh colourful salad"
                fill
                sizes="220px"
              />
            </div>
          </div>
        </section>
        <section className="section">
          <SectionTitle
            eyebrow="LOCAL FAVOURITES, DELIVERED"
            title="Great food. Right around you."
            link="/restaurants"
          />
          <div className="filter-row">
            <Link className="chip selected" href="/restaurants">
              All restaurants
            </Link>
            <Link className="chip" href="/restaurants?sort=rating">
              <Sparkles size={15} />
              Top rated
            </Link>
            <Link className="chip" href="/restaurants?fast=true">
              <Clock3 size={15} />
              Under 30 min
            </Link>
            <Link className="chip" href="/restaurants?veg=true">
              <span className="veg-dot" />
              Pure veg
            </Link>
            <Link className="chip" href="/restaurants?offers=true">
              <Tag size={15} />
              Great offers
            </Link>
          </div>
          <div className="restaurant-grid">
            {isPending && [1,2,3].map(i=><div key={i} className="skeleton h-72 rounded-2xl"/>)}
            {isError && <p className="notice">Could not load restaurants. Please try again later.</p>}
            {featured?.data.map((r) => (
              <RestaurantCard key={r.id} restaurant={r} />
            ))}
          </div>
          <div className="text-center mt-8">
            <Button asChild variant="outline">
              <Link href="/restaurants">
                Explore all restaurants <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </section>
        <section className="section brands-section">
          <SectionTitle
            eyebrow="THE ONES YOU COME BACK FOR"
            title="Big names. Bigger flavours."
          />
          <div className="brand-grid">
            {featured?.data.map((r, i) => (
              <Link href={`/restaurant/${r.id}`} key={r.id}>
                <div className={`brand-mark brand-${i}`}>
                  {r.name
                    .split(" ")
                    .filter((w) => w !== "The")
                    .slice(0, 2)
                    .join("\n")}
                </div>
                <strong>{r.name}</strong>
                <span>
                  {r.minutes}–{r.minutes + 5} min
                </span>
              </Link>
            ))}
          </div>
        </section>
        <HomeRestaurantSection title="Popular restaurants" eyebrow="LOVED BY FOODIES" query={{sort:"reviews",limit:3}} />
        <HomeRestaurantSection title="Top rated restaurants" eyebrow="HIGHLY RATED" query={{sort:"rating",limit:3}} />
        <HomeRestaurantSection title="Fast delivery" eyebrow="QUICK PICKS" query={{sort:"time",limit:3}} />
        <HomeRestaurantSection title="Offers and discounts" eyebrow="MORE TO ENJOY" query={{offers:"true",limit:3}} />
        <TrendingFood />
        <RecommendationsEntry />
        <section className="closing-banner">
          <div>
            <span className="eyebrow">GOOD FOOD BRINGS US TOGETHER</span>
            <h2>A table for every mood.</h2>
            <p>
              Explore your city through its kitchens. Your next favourite is
              waiting.
            </p>
          </div>
          <Button asChild>
            <Link href="/restaurants">
              Find something delicious <ArrowRight size={17} />
            </Link>
          </Button>
        </section>
      </main>
    </>
  );
}
function HomeRestaurantSection({title,eyebrow,query}:{title:string;eyebrow:string;query:Record<string,string|number>}) {
  const {data,isPending,isError}=useQuery({queryKey:["home-section",title],queryFn:()=>catalogService.list(query),staleTime:60_000,retry:1});
  return <section className="section"><SectionTitle title={title} eyebrow={eyebrow} link="/restaurants"/><div className="restaurant-grid">{isPending&&[1,2,3].map(i=><div key={i} className="skeleton h-72 rounded-2xl"/>)}{data?.data.map(r=><RestaurantCard key={r.id} restaurant={r}/>)}{isError&&<p className="notice">Could not load this section.</p>}{data&&!data.data.length&&<p className="muted">No restaurants available yet.</p>}</div></section>;
}
function TrendingFood() {
  const {data,isPending,isError}=useQuery({queryKey:["trending-food"],queryFn:catalogService.trending,staleTime:60_000});
  return <section className="section"><SectionTitle title="Trending food" eyebrow="POPULAR DISHES"/><div className="restaurant-grid">{isPending&&[1,2,3].map(i=><div key={i} className="skeleton h-72 rounded-2xl"/>)}{data?.map(i=><Link className="restaurant-card" href={`/restaurant/${i.restaurantId}?search=${encodeURIComponent(i.name)}`} key={i.id}><div className="card-photo"><Image src={i.image} alt={i.name} fill sizes="(max-width: 640px) 100vw, 33vw"/></div><div className="card-content"><h3>{i.name}</h3><p>{i.description}</p><strong>₹{i.price}</strong></div></Link>)}{isError&&<p className="notice">Could not load trending food.</p>}{data&&!data.length&&<p className="muted">No trending dishes yet.</p>}</div></section>;
}
function SectionTitle({
  eyebrow,
  title,
  link,
}: {
  eyebrow: string;
  title: string;
  link?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow muted">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {link && (
        <Link href={link}>
          View all <ChevronRight size={16} />
        </Link>
      )}
    </div>
  );
}
