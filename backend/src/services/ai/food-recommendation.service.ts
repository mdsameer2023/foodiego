import mongoose from "mongoose";
import { Restaurant } from "../../models/Restaurant.js";
import { MenuItem } from "../../models/MenuItem.js";
import { Favorite } from "../../models/Favorite.js";
import { Order } from "../../models/Order.js";
import { type RecommendationInput, type FoodCard } from "./ai-validation.js";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cuisines = [
  "Biryani",
  "Pizza",
  "Burgers",
  "North Indian",
  "South Indian",
  "Healthy Food",
  "Chinese",
  "Japanese",
  "Momos",
  "Rolls",
  "Sandwiches",
  "Ice Cream",
  "Desserts",
];
const foods = [
  "pasta",
  "fries",
  "pancakes",
  "coffee",
  "noodles",
  "dosa",
  "paneer",
  "chicken",
  "momos",
  "sandwich",
  "biryani",
  "pizza",
  "burger",
  "roll",
  "ice cream",
  "cake",
];
function safeImage(value: string) {
  if (value.startsWith("/images/")) return value;
  try {
    const url = new URL(value);
    if (url.pathname.startsWith("/images/")) return url.pathname;
    if (
      url.protocol === "https:" &&
      ["images.unsplash.com", "res.cloudinary.com"].includes(url.hostname)
    )
      return value;
  } catch {
    /* Use the existing local fallback. */
  }
  return "/images/biryani.jpg";
}
export function extractConstraints(input: RecommendationInput) {
  const message = input.message.toLowerCase();
  const excludedFoods = foods.filter((food) =>
    new RegExp(
      `(?:no|without|avoid|not|don't suggest|do not suggest)\\s+(?:any\\s+)?${escape(food)}`,
      "i",
    ).test(message),
  );
  const budget =
    /(?:under|below|less than|upto|up to|budget(?: of)?|₹|rs\.?|inr)\s*₹?\s*(\d{1,6}(?:\.\d{1,2})?)/i.exec(
      message,
    );
  const cuisine =
    input.cuisine ||
    cuisines.find(
      (c) =>
        message.includes(c.toLowerCase()) &&
        !excludedFoods.some((food) => c.toLowerCase().includes(food)),
    );
  const dietary =
    input.dietary !== "any"
      ? input.dietary
      : /non[ -]?veg/.test(message)
        ? "non-vegetarian"
        : /vegetarian|\bveg\b|no meat|without meat/.test(message)
          ? "vegetarian"
          : /chicken/.test(message) && !excludedFoods.includes("chicken")
            ? "non-vegetarian"
            : "any";
  const maxPrice = Math.min(
    input.maxPrice ?? Infinity,
    budget
      ? Number(budget[1])
      : /affordable|cheap|budget.friendly/.test(message)
        ? 200
        : Infinity,
  );
  return {
    city: input.city,
    cuisine,
    dietary,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
    food: foods.find(
      (food) => message.includes(food) && !excludedFoods.includes(food),
    ),
    excludedFoods,
    bestRated: /best.rated|top.rated|highest.rated/.test(message),
    fast: /fast|quick|jaldi/.test(message),
    spicy: /spicy|chilli|chili|teekha/.test(message),
    allergen: /allerg|nut.free|gluten.free|diabet|pregnan|\bvegan\b/.test(
      message,
    ),
  };
}
export async function retrieveFood(
  input: RecommendationInput,
  userId?: mongoose.Types.ObjectId,
) {
  const constraints = extractConstraints(input);
  if (input.section === "frequent" && (!input.personalize || !userId))
    return {
      cards: [] as FoodCard[],
      constraints,
      frequentCuisines: [] as string[],
      notice:
        "Sign in and choose personalization to use your own order history.",
    };
  if (constraints.allergen)
    return {
      cards: [] as FoodCard[],
      constraints,
      frequentCuisines: [] as string[],
      notice:
        "Ingredient and allergen suitability is not verified. Please confirm directly with the restaurant before ordering.",
    };
  let similarCuisines: string[] = [];
  if (input.section === "similar" && input.restaurantId) {
    const source = await Restaurant.findOne({
      _id: input.restaurantId,
      isApproved: true,
      isOpen: true,
    })
      .select("cuisines")
      .lean();
    if (!source)
      return {
        cards: [] as FoodCard[],
        constraints,
        frequentCuisines: [] as string[],
        notice: "That restaurant is currently unavailable.",
      };
    similarCuisines = source.cuisines;
  }
  const filter: Record<string, unknown> = {
    isApproved: true,
    isOpen: true,
    city: { $regex: `^${escape(constraints.city)}$`, $options: "i" },
  };
  if (constraints.cuisine)
    filter.cuisines = {
      $regex: `^${escape(constraints.cuisine)}$`,
      $options: "i",
    };
  else if (similarCuisines.length) filter.cuisines = { $in: similarCuisines };
  if (input.section === "similar" && input.restaurantId)
    filter._id = { $ne: new mongoose.Types.ObjectId(input.restaurantId) };
  const restaurants = await Restaurant.find(filter)
    .select("name cuisines images rating reviewCount averageDeliveryTime city")
    .sort({ rating: -1, _id: 1 })
    .limit(100)
    .lean();
  const byId = new Map(restaurants.map((row) => [String(row._id), row]));
  let favorites: string[] = [],
    frequentCuisines: string[] = [];
  if (input.personalize && userId) {
    const [saved, history] = await Promise.all([
      Favorite.find({ userId }).select("restaurantId").limit(100).lean(),
      Order.aggregate([
        { $match: { userId, orderStatus: "DELIVERED" } },
        { $sort: { createdAt: -1 } },
        { $limit: 100 },
        { $group: { _id: "$restaurantId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);
    favorites = saved.map((row) => String(row.restaurantId));
    const ordered = await Restaurant.find({
      _id: { $in: history.map((row) => row._id) },
      isApproved: true,
    })
      .select("cuisines")
      .lean();
    frequentCuisines = [
      ...new Set(ordered.flatMap((row) => row.cuisines)),
    ].slice(0, 6);
  }
  const itemFilter: Record<string, unknown> = {
    restaurantId: { $in: restaurants.map((row) => row._id) },
    isAvailable: true,
  };
  if (constraints.maxPrice !== undefined)
    itemFilter.price = { $lte: constraints.maxPrice };
  if (constraints.dietary !== "any")
    itemFilter.isVegetarian = constraints.dietary === "vegetarian";
  if (constraints.food)
    itemFilter.name = { $regex: escape(constraints.food), $options: "i" };
  if (constraints.excludedFoods.length)
    itemFilter.$nor = constraints.excludedFoods.map((food) => ({
      name: { $regex: escape(food), $options: "i" },
    }));
  if (constraints.spicy)
    itemFilter.$or = [
      { name: { $regex: "spicy|chilli|chili|pepper|kung pao", $options: "i" } },
      { description: { $regex: "spicy|chilli|chili|pepper", $options: "i" } },
    ];
  if (input.section === "budget" && constraints.maxPrice === undefined)
    itemFilter.price = { $lte: 200 };
  const rows = await MenuItem.find(itemFilter)
    .select("name description image price restaurantId isVegetarian isPopular")
    .sort({ price: 1, _id: 1 })
    .limit(240)
    .lean();
  const preferred = new Set(
    [...input.preferredCuisines, ...frequentCuisines].map((s) =>
      s.toLowerCase(),
    ),
  );
  const cards = rows
    .flatMap((row) => {
      const restaurant = byId.get(String(row.restaurantId));
      if (!restaurant || !Number.isFinite(row.price) || row.price < 0)
        return [];
      const pricePaise = Math.round(row.price * 100);
      if (!Number.isSafeInteger(pricePaise)) return [];
      let score =
          restaurant.rating * (constraints.bestRated ? 100 : 8) +
          (row.isPopular ? 12 : 0),
        reason = "Available from an open restaurant in your selected city.";
      const reasonCodes = ["MATCH"];
      if (pricePaise <= 20000) {
        score += 8;
        reasonCodes.push("BUDGET");
        reason =
          "An option priced at ₹200 or less, before delivery fees and taxes.";
      }
      if (restaurant.reviewCount > 0 && restaurant.rating >= 4) {
        reasonCodes.push("POPULAR");
        score += 6;
        reason = "Rated at least 4 stars by customers.";
      }
      if (constraints.fast || /fast/.test(input.message)) {
        score -= restaurant.averageDeliveryTime * 0.8;
        reasonCodes.push("FAST");
        reason = `The restaurant lists a typical delivery time of ${restaurant.averageDeliveryTime} minutes; timing is not guaranteed.`;
      }
      if (
        input.personalize &&
        (favorites.includes(String(restaurant._id)) ||
          restaurant.cuisines.some((c) => preferred.has(c.toLowerCase())))
      ) {
        score += 35;
        reasonCodes.push("PREFERENCE");
        reason =
          "Matches cuisines or restaurants you chose to use for personalization.";
      }
      if (
        input.section === "frequent" &&
        restaurant.cuisines.some((c) => frequentCuisines.includes(c))
      )
        score += 40;
      if (input.section === "trending") score += row.isPopular ? 50 : 0;
      if (
        input.section === "discover" &&
        !favorites.includes(String(restaurant._id)) &&
        !restaurant.cuisines.some((c) => preferred.has(c.toLowerCase()))
      ) {
        score += 25;
        reasonCodes.push("DISCOVER");
        reason =
          "A different option from your selected favorites and cuisine preferences.";
      }
      if (input.section === "budget") score -= row.price / 10;
      return [
        {
          id: String(row._id),
          restaurantId: String(restaurant._id),
          restaurantName: restaurant.name,
          name: row.name,
          description: row.description?.replace(/<[^>]*>/g, "").slice(0, 500),
          image: safeImage(
            row.image || restaurant.images[0] || "/images/biryani.jpg",
          ),
          pricePaise,
          rating: restaurant.rating,
          reviewCount: restaurant.reviewCount,
          deliveryMinutes: restaurant.averageDeliveryTime,
          vegetarian: row.isVegetarian,
          cuisines: restaurant.cuisines,
          reason,
          reasonCodes,
          score,
          href: `/restaurant/${restaurant._id}?search=${encodeURIComponent(row.name)}#dish-${row._id}`,
        } satisfies FoodCard,
      ];
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 24);
  return {
    cards,
    constraints,
    frequentCuisines,
    notice: cards.length
      ? ""
      : "No currently available dishes match these filters. Try another cuisine, city or budget.",
  };
}
