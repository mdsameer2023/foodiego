import assert from "node:assert/strict";
import test from "node:test";
import { totals, filterRestaurants, type Filters } from "../src/lib/commerce";
import { menu, restaurants } from "../src/lib/data";
import type { CartItem } from "../src/types";
const item: CartItem = {
  ...menu[0],
  price: 200,
  quantity: 2,
  option: "Regular",
  extra: 0,
  key: "test",
};
test("checkout totals include customization, capped coupon, tax and delivery", () => {
  assert.deepEqual(totals([item], "FIRSTBITE"), {
    subtotal: 400,
    delivery: 35,
    tax: 20,
    discount: 100,
    total: 355,
  });
  assert.equal(totals([{ ...item, extra: 60 }], "").delivery, 0);
  assert.equal(totals([{ ...item, extra: 60 }], "").total, 546);
});
test("empty cart and invalid or below-minimum coupons do not discount", () => {
  assert.equal(totals([], "FIRSTBITE").total, 0);
  assert.equal(totals([item], "INVALID").discount, 0);
  assert.equal(
    totals([{ ...item, quantity: 1, price: 100 }], "FIRSTBITE").discount,
    0,
  );
});
test("catalog has unique IDs and consistent menu references", () => {
  assert.ok(restaurants.length >= 20);
  assert.ok(menu.length >= 100);
  assert.equal(new Set(menu.map((i) => i.id)).size, menu.length);
  assert.ok(
    menu.every((i) => restaurants.some((r) => r.id === i.restaurantId)),
  );
});
test("combined filters and numeric sorting return matching restaurants", () => {
  const filters: Filters = {
    search: "",
    cuisine: "",
    veg: true,
    rating: true,
    fast: true,
    offers: false,
    price: "500",
    sort: "price",
  };
  const found = filterRestaurants(restaurants, filters);
  assert.ok(found.length);
  assert.ok(
    found.every(
      (r) => r.veg && r.rating >= 4.5 && r.minutes <= 25 && r.price <= 500,
    ),
  );
  assert.ok(found.every((r, i) => !i || found[i - 1].price <= r.price));
  assert.equal(
    filterRestaurants(restaurants, { ...filters, search: "No such kitchen" })
      .length,
    0,
  );
});
