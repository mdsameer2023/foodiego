import { test, expect } from "@playwright/test";

test("database-backed discovery keeps search, filters and menu controls functional", async ({page}) => {
  await page.goto("/restaurants?q=paneer");
  await expect(page.locator(".restaurant-card").first()).toBeVisible();
  await page.getByRole("button",{name:"4.5+"}).click();
  await expect(page).toHaveURL(/ratingMin=4.5/);
  await page.goto("/restaurants?cuisine=Momos");
  await expect(page.locator(".restaurant-card")).toHaveCount(1);
  await page.getByRole("link",{name:"Steam Basket",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Steam Basket"})).toBeVisible();
  await expect(page.locator(".menu-item")).toHaveCount(6);
  await page.getByLabel("Dietary menu").selectOption("true");
  await expect(page.locator(".menu-item")).toHaveCount(5);
  await page.getByLabel("Dietary menu").selectOption("false");
  await expect(page.locator(".menu-item")).toHaveCount(1);
  await expect(page.getByText("Chicken Momos",{exact:true})).toBeVisible();
  await expect(page.locator(".review")).toHaveCount(2);
});

test("nearby discovery returns geospatial Atlas records", async ({page}) => {
  await page.goto("/restaurants?lat=22.5726&lng=88.3639&radiusKm=10");
  await expect(page.locator(".restaurant-card")).toHaveCount(9);
  await expect(page.getByText("30 restaurants")).toBeVisible();
});
