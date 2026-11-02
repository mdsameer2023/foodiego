import { cache } from "react";
import { catalogService } from "@/services/catalog";
import type { Restaurant } from "@/types";
export const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
);
export const restaurantForPage = cache((id: string) => catalogService.get(id));
export function restaurantSlug(name: string) {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "restaurant"
  );
}
export function restaurantPath(r: Restaurant) {
  return `/restaurant/${encodeURIComponent(r.id)}/${restaurantSlug(r.name)}`;
}
export const jsonLd = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c");
export function restaurantStructuredData(r: Restaurant) {
  const url = new URL(restaurantPath(r), siteUrl).href;
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: r.name,
    description: r.description,
    url,
    image: r.images?.map((image) => new URL(image, siteUrl).href) || [],
    servesCuisine: r.cuisine.split(",").map((c) => c.trim()),
    address: {
      "@type": "PostalAddress",
      streetAddress: r.address,
      addressLocality: r.city,
    },
    ...(r.reviews > 0 && r.rating > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: r.rating,
            reviewCount: r.reviews,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}
