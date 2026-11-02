import type { Restaurant, MenuItem } from "@/types";
export const photos = {
  pizza: "/images/pizza.jpg",
  burger: "/images/burger.jpg",
  biryani: "/images/biryani.jpg",
  indian: "/images/indian.jpg",
  salad: "/images/salad.jpg",
  sushi: "/images/sushi.jpg",
  dessert: "/images/dessert.jpg",
  noodles: "/images/noodles.jpg",
  southIndian: "/images/south-indian.jpg",
  momos: "/images/momos.jpg",
  rolls: "/images/rolls.jpg",
  sandwiches: "/images/sandwiches.jpg",
  iceCream: "/images/ice-cream.jpg",
};
export const categories = [
  { name: "Biryani", image: photos.biryani },
  { name: "Pizza", image: photos.pizza },
  { name: "Burgers", image: photos.burger },
  { name: "North Indian", image: photos.indian },
  { name: "Healthy Food", image: photos.salad },
  { name: "Chinese", image: photos.noodles },
  { name: "Desserts", image: photos.dessert },
  { name: "Japanese", image: photos.sushi },
  { name: "South Indian", image: photos.southIndian },
  { name: "Momos", image: photos.momos },
  { name: "Rolls", image: photos.rolls },
  { name: "Sandwiches", image: photos.sandwiches },
  { name: "Ice Cream", image: photos.iceCream },
];
const entries: [
  string,
  string,
  keyof typeof photos,
  number,
  number,
  number,
  boolean,
][] = [
  ["The Biryani House", "Biryani", "biryani", 4.8, 25, 450, false],
  ["Napoli & Co.", "Pizza", "pizza", 4.7, 30, 650, true],
  ["Stacked Burger Club", "Burgers", "burger", 4.6, 20, 400, false],
  ["Punjab Table", "North Indian", "indian", 4.8, 35, 550, false],
  ["Green Bowl Kitchen", "Healthy", "salad", 4.5, 20, 350, true],
  ["Wok This Way", "Chinese", "noodles", 4.4, 25, 450, false],
  ["Sugar & Crumb", "Desserts", "dessert", 4.7, 30, 300, true],
  ["Miso Happy", "Japanese", "sushi", 4.9, 40, 900, false],
  ["Dum & Spice", "Biryani", "biryani", 4.5, 30, 500, false],
  ["Little Italy Kitchen", "Pizza", "pizza", 4.6, 35, 700, true],
  ["Bun Theory", "Burgers", "burger", 4.3, 20, 350, false],
  ["Saffron Stories", "North Indian", "indian", 4.7, 40, 800, false],
  ["The Good Leaf", "Healthy", "salad", 4.6, 25, 450, true],
  ["Chopstick Lane", "Chinese", "noodles", 4.2, 30, 400, false],
  ["Buttercream Studio", "Desserts", "dessert", 4.8, 25, 450, true],
  ["Tokyo Table", "Japanese", "sushi", 4.6, 45, 1000, false],
  ["Royal Handi", "Biryani", "biryani", 4.4, 35, 600, false],
  ["Firewood Pizzeria", "Pizza", "pizza", 4.9, 30, 750, true],
  ["Smash Society", "Burgers", "burger", 4.5, 25, 500, false],
  ["Tandoor Trail", "North Indian", "indian", 4.6, 30, 550, false],
  ["Harvest Kitchen", "Healthy", "salad", 4.7, 20, 400, true],
  ["Sweet Little Things", "Desserts", "dessert", 4.5, 35, 350, true],
  ["Red Lantern", "Chinese", "noodles", 4.6, 30, 600, false],
  ["Sakura Kitchen", "Japanese", "sushi", 4.8, 40, 950, false],
];
export const restaurants: Restaurant[] = entries.map(
  ([name, cuisine, image, rating, minutes, price, veg], i) => ({
    id: String(i + 1),
    name,
    cuisine,
    image: photos[image],
    rating,
    reviews: 120 + i * 37,
    minutes,
    price,
    veg,
    offer:
      i % 3 === 0
        ? "50% OFF up to ₹100"
        : i % 3 === 1
          ? "Free delivery"
          : "20% OFF up to ₹80",
    area: ["Park Street", "Salt Lake", "Ballygunge", "New Town"][i % 4],
  }),
);
const dishes: Record<string, string[]> = {
  Biryani: [
    "Hyderabadi dum biryani",
    "Paneer dum biryani",
    "Chicken tikka",
    "Vegetable kebabs",
    "Raita & salad",
  ],
  Pizza: [
    "Margherita classica",
    "Burrata & basil pizza",
    "Truffle mushroom pizza",
    "Garlic bread",
    "Chocolate brownie",
  ],
  Burgers: [
    "Signature smash burger",
    "Crispy paneer burger",
    "BBQ chicken burger",
    "Seasoned fries",
    "Chocolate shake",
  ],
  "North Indian": [
    "Butter chicken",
    "Paneer makhani",
    "Dal makhani",
    "Garlic naan",
    "Gulab jamun",
  ],
  Healthy: [
    "Harvest grain bowl",
    "Avocado crunch salad",
    "Mediterranean bowl",
    "Hummus & pita",
    "Berry yogurt",
  ],
  Chinese: [
    "Chilli garlic noodles",
    "Vegetable fried rice",
    "Kung pao chicken",
    "Crispy spring rolls",
    "Sesame tofu",
  ],
  Desserts: [
    "Chocolate celebration cake",
    "Strawberry cheesecake",
    "Classic tiramisu",
    "Fudge brownie",
    "Vanilla bean ice cream",
  ],
  Japanese: [
    "Salmon sushi platter",
    "Avocado maki",
    "Teriyaki chicken bowl",
    "Vegetable gyoza",
    "Miso soup",
  ],
};
export const menu: MenuItem[] = restaurants.flatMap((r) =>
  dishes[r.cuisine].map((name, i) => ({
    id: `${r.id}-${i}`,
    restaurantId: r.id,
    name,
    description: [
      "Our house favourite, freshly prepared with fragrant spices and carefully chosen ingredients.",
      "A comforting classic with a fresh twist. Made to order, just for you.",
    ][i % 2],
    price: Math.round((r.price / 2 + i * 25) / 10) * 10,
    image: r.image,
    veg:
      r.veg ||
      i === 1 ||
      i === 3 ||
      i === 4 ||
      (r.cuisine === "North Indian" && i === 2) ||
      (r.cuisine === "Chinese" && i === 0),
    category: i < 3 ? "Recommended" : "Sides & treats",
  })),
);
export const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
