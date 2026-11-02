"use client";
import Image from "next/image";
import Link from "next/link";
import { Clock3, Star, ArrowUpRight } from "lucide-react";
import { DietaryMark } from "@/components/food/dietary-mark";
import { localImage } from "@/services/catalog";
import type { FoodRecommendation } from "@/services/ai";
export function RecommendationCard({
  food,
  compact = false,
}: {
  food: FoodRecommendation;
  compact?: boolean;
}) {
  return (
    <article className={`ai-food-card ${compact ? "ai-food-compact" : ""}`}>
      <div className="ai-food-photo">
        <Image
          src={localImage(food.image)}
          alt={food.name}
          fill
          sizes={compact ? "96px" : "(max-width: 767px) 75vw, 320px"}
        />
        <span className="ai-price">
          {new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2,
          }).format(food.pricePaise / 100)}
        </span>
      </div>
      <div className="ai-food-info">
        <small>{food.restaurantName}</small>
        <h3>
          <DietaryMark veg={food.vegetarian} />
          {food.name}
        </h3>
        <div className="ai-food-facts">
          {food.reviewCount > 0 ? (
            <span>
              <Star size={13} />
              {food.rating.toFixed(1)} ({food.reviewCount})
            </span>
          ) : (
            <span>Not rated yet</span>
          )}
          <span>
            <Clock3 size={13} />
            {food.deliveryMinutes} min typical
          </span>
        </div>
        <p>{food.reason}</p>
        <Link
          href={`/restaurant/${encodeURIComponent(food.restaurantId)}?search=${encodeURIComponent(food.name)}#dish-${encodeURIComponent(food.id)}`}
        >
          View restaurant <ArrowUpRight size={15} />
        </Link>
      </div>
    </article>
  );
}
