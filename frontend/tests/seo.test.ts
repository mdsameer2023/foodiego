import assert from "node:assert/strict";
import { test } from "node:test";
import {
  jsonLd,
  restaurantSlug,
  restaurantStructuredData,
  restaurantPath,
} from "../src/lib/seo";
import type { Restaurant } from "../src/types";
test("restaurant URLs keep stable IDs and readable slugs", () => {
  assert.equal(restaurantSlug("Napoli & Co."), "napoli-co");
  assert.equal(
    restaurantPath({ id: "abc123", name: "Napoli & Co." } as Restaurant),
    "/restaurant/abc123/napoli-co",
  );
});
test("JSON-LD cannot terminate its script and does not invent ratings", () => {
  const input = { name: "</script><script>alert(1)</script>" };
  const encoded = jsonLd(input);
  assert.equal(encoded.includes("</script>"), false);
  assert.deepEqual(JSON.parse(encoded), input);
  const restaurant = {
    id: "abc123",
    name: "Test Kitchen",
    cuisine: "Indian",
    image: "/images/indian.jpg",
    images: ["/images/indian.jpg"],
    rating: 0,
    reviews: 0,
    minutes: 30,
    price: 300,
    offer: "",
    veg: true,
    area: "Park Street",
    city: "Kolkata",
    address: "12 Park Street",
  } satisfies Restaurant;
  const schema = restaurantStructuredData(restaurant);
  assert.equal("aggregateRating" in schema, false);
  assert.equal(schema.address.addressLocality, "Kolkata");
  assert.equal("geo" in schema, false);
});
