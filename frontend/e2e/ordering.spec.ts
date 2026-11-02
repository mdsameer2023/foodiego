import { test, expect } from "@playwright/test";
test("guest cart keeps database menu customizations and requires login for checkout", async ({
  page,
}) => {
  await page.goto("/restaurants?cuisine=Biryani");
  await expect(page.locator(".restaurant-card")).toHaveCount(3);
  await page
    .getByRole("link", { name: "The Biryani House", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ADD +", exact: true })
    .first()
    .click();
  await page.getByLabel("Extra portion").check();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.goto("/cart");
  await expect(page.getByText("Extra portion", {exact:true})).toBeVisible();
  await expect(page.getByText(/Guest cart: log in/)).toBeVisible();
  await page.reload();
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await page.getByRole("link", { name: "Log in to checkout" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout|\/login\?next=\/checkout/);
});
test("single restaurant cart requires explicit replacement and survives reload", async ({
  page,
}) => {
  await page.goto("/restaurant/1");
  await page
    .getByRole("button", { name: "ADD +", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.goto("/restaurant/2");
  await page
    .getByRole("button", { name: "ADD +", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByText(/Your cart contains items from another restaurant/)).toBeVisible();
  await page.getByRole("button", { name: "Start New Cart" }).click();
  await page.goto("/cart");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Napoli & Co." }),
  ).toBeVisible();
  await expect(page.locator(".cart-item")).toHaveCount(1);
});
test("responsive pages fit 320, 768, 1024 and 1440 pixel viewports", async ({
  page,
}) => {
  for (const width of [320, 375, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/",
      "/restaurants",
      "/restaurant/1",
      "/login",
      "/signup",
      "/cart",
      "/checkout",
    ]) {
      await page.goto(route);
      await expect(page.locator("h1,h2").first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `${route} overflows at ${width}px`).toBe(false);
    }
  }
});
test("favorites require login, empty searches, and account feedback", async ({
  page,
}) => {
  await page.goto("/restaurants");
  await page
    .getByRole("button", { name: "Save The Biryani House to favorites" })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/favorites");
  await expect(page.getByRole("heading",{name:"Log in to see your favorites"})).toBeVisible();
  await page.goto("/restaurants");
  await page
    .getByRole("textbox", { name: "Search restaurants or food", exact: true })
    .fill("No matching restaurant");
  await expect(
    page.getByText("No restaurants match your search."),
  ).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Email address").fill("demo@example.com");
  await page.getByLabel("Password", { exact: true }).fill("demo-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.locator(".auth-form [role=alert]"),
  ).toBeVisible();
});
