import { menu } from "./data";
import type { CartItem, Restaurant } from "../types";
export function totals(items: CartItem[], coupon: string) {
  const subtotal = items.reduce(
    (s, i) => s + (i.price + i.extra) * i.quantity,
    0,
  );
  const delivery = subtotal >= 500 || !subtotal ? 0 : 35;
  const tax = Math.round(subtotal * 0.05);
  const discount =
    coupon === "FIRSTBITE" && subtotal >= 199
      ? Math.min(100, Math.round(subtotal * 0.5))
      : 0;
  return {
    subtotal,
    delivery,
    tax,
    discount,
    total: subtotal + delivery + tax - discount,
  };
}
export type Filters = {
  search: string;
  cuisine: string;
  veg: boolean;
  rating: boolean;
  fast: boolean;
  offers: boolean;
  price: string;
  sort: string;
};
export function filterRestaurants(data: Restaurant[], f: Filters) {
  return data
    .filter(
      (r) =>
        (!f.search ||
          `${r.name} ${r.cuisine} ${menu
            .filter((i) => i.restaurantId === r.id)
            .map((i) => i.name)
            .join(" ")}`
            .toLowerCase()
            .includes(f.search.toLowerCase())) &&
        (!f.cuisine || r.cuisine === f.cuisine) &&
        (!f.veg || r.veg) &&
        (!f.rating || r.rating >= 4.5) &&
        (!f.fast || r.minutes <= 25) &&
        (!f.offers || r.offer.includes("OFF")) &&
        (!f.price || r.price <= Number(f.price)),
    )
    .sort((a, b) =>
      f.sort === "rating"
        ? b.rating - a.rating
        : f.sort === "price"
          ? a.price - b.price
          : f.sort === "time"
            ? a.minutes - b.minutes
            : 0,
    );
}
