import { test, expect, type Page } from "@playwright/test";
const food = {
  id: "111111111111111111111111",
  restaurantId: "222222222222222222222222",
  restaurantName: "Test Bowl Kitchen",
  name: "Spicy Paneer Bowl",
  image: "/images/salad.jpg",
  pricePaise: 18000,
  rating: 4.6,
  reviewCount: 12,
  deliveryMinutes: 25,
  vegetarian: true,
  cuisines: ["Healthy Food"],
  reason: "An option priced at ₹200 or less, before delivery fees and taxes.",
  href: "/restaurant/222222222222222222222222?search=Spicy%20Paneer%20Bowl#dish-111111111111111111111111",
};
const reply = {
  mode: "fallback",
  message: "Here are matching dishes from the current catalog.",
  cards: [food],
  frequentlyOrderedCuisines: [],
  personalized: false,
  retentionMinutes: 15,
  disclaimer: "Prices are checked again at checkout.",
};
async function basics(page: Page) {
  await page.route("http://localhost:*/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: {
          data: {
            user: {
              id: "customer-test",
              name: "FoodieGo Tester",
              email: "test@example.invalid",
              role: "CUSTOMER",
              isEmailVerified: true,
            },
          },
        },
      });
    if (path === "/api/auth/csrf")
      return route.fulfill({ json: { data: { csrfToken: "test-csrf" } } });
    if (path === "/api/cart")
      return route.fulfill({
        json: {
          data: {
            restaurant: null,
            items: [],
            pricing: {
              subtotalPaise: 0,
              customizationPaise: 0,
              deliveryFeePaise: 0,
              packagingFeePaise: 0,
              taxPaise: 0,
              discountPaise: 0,
              totalPaise: 0,
            },
          },
        },
      });
    if (path.startsWith("/api/ai/"))
      return route.fulfill({
        json: {
          data: {
            ...reply,
            mode: path.endsWith("chat") ? "fallback" : "catalog",
          },
        },
      });
    if (path.endsWith("/cuisines"))
      return route.fulfill({
        json: {
          data: [
            { name: "Biryani", count: 1 },
            { name: "Pizza", count: 1 },
          ],
        },
      });
    return route.fulfill({
      json: { data: [], meta: { page: 1, pages: 0, total: 0 } },
    });
  });
}
test("assistant works at all requested responsive widths and restores keyboard focus", async ({
  page,
}) => {
  await basics(page);
  for (const width of [320, 375, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    const launcher = page.getByRole("button", {
      name: "Open FoodieGo food assistant",
    });
    await launcher.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("Ask the food assistant")).toBeFocused();
    await page
      .getByLabel("Ask the food assistant")
      .fill("vegetarian under ₹200");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByRole("heading", { name: /Spicy Paneer Bowl/ }).last(),
    ).toBeVisible();
    await expect(
      page.getByText("Catalog fallback · Gemini unavailable"),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "View restaurant" }),
    ).toHaveAttribute("href", /restaurant\/222222222222222222222222\?search=/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `assistant overflow at ${width}`,
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(launcher).toBeFocused();
  }
});
test("assistant has explicit personalization, retry and reset states", async ({
  page,
}) => {
  await basics(page);
  let attempts = 0;
  await page.route("http://localhost:*/api/ai/chat", (route) => {
    attempts++;
    const body = route.request().postDataJSON();
    expect(body.personalize).toBe(true);
    if (attempts === 1)
      return route.fulfill({
        status: 503,
        json: { error: { message: "Assistant temporarily unavailable" } },
      });
    return route.fulfill({ json: { data: reply } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open FoodieGo food assistant" })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Use my favorites and past orders", { exact: true })
    .check();
  await page.getByLabel("Ask the food assistant").fill("food under 200");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    /Assistant temporarily unavailable/,
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: /Spicy Paneer Bowl/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset conversation" }).click();
  await expect(
    page.getByRole("heading", { name: "What sounds good today?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Spicy Paneer Bowl"),
  ).toHaveCount(0);
});
test("recommendation discovery is independent of the provider and supports diet filters", async ({
  page,
}) => {
  await basics(page);
  let requestDiet = "";
  await page.route("http://localhost:*/api/ai/recommendations", (route) => {
    const body = route.request().postDataJSON();
    requestDiet = body.dietary;
    return route.fulfill({ json: { data: { ...reply, mode: "catalog" } } });
  });
  await page.goto("/");
  await page
    .getByRole("region", { name: "Food recommendations" })
    .scrollIntoViewIfNeeded();
  await page
    .getByLabel("Recommendation dietary preference")
    .selectOption("vegetarian");
  await expect.poll(() => requestDiet).toBe("vegetarian");
  await expect(
    page
      .getByRole("region", { name: "Food recommendations" })
      .getByText("Test Bowl Kitchen"),
  ).toBeVisible();
});
test("public metadata and private noindex rules are present", async ({
  page,
}) => {
  await basics(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/FoodieGo/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /FoodieGo/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^https?:\/\//,
  );
  await page.goto("/admin");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  const robots = await page.request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /admin");
  const sitemap = await page.request.get("/sitemap.xml");
  const xml = await sitemap.text();
  expect(xml).toContain("<urlset");
  expect(xml).not.toContain("/checkout");
  expect(xml).not.toContain("/admin");
});
test("administrator monitoring displays real counters and truthful AI configuration state", async ({
  page,
}) => {
  await basics(page);
  await page.route("http://localhost:*/api/auth/me", (route) =>
    route.fulfill({
      json: {
        data: {
          user: {
            id: "admin-test",
            name: "Monitoring Admin",
            role: "ADMIN",
            isEmailVerified: true,
          },
        },
      },
    }),
  );
  await page.route("http://localhost:*/api/admin/monitoring", (route) =>
    route.fulfill({
      json: {
        data: {
          uptimeSeconds: 120,
          requests: 42,
          serverErrors: 1,
          paymentErrors: 0,
          webhookErrors: 0,
          orderErrors: 0,
          slowRequests: 2,
          scope: "Current process counters",
        },
      },
    }),
  );
  await page.route("http://localhost:*/api/ai/status", (route) =>
    route.fulfill({
      json: {
        data: {
          configured: false,
          model: null,
          providerVerified: false,
          dailyRequestLimit: 200,
          dailyTokenLimit: 500000,
          usage: null,
          conversationStorage: "none",
        },
      },
    }),
  );
  await page.route("http://localhost:*/api/health/ready", (route) =>
    route.fulfill({
      json: { data: { status: "ready", database: "connected" } },
    }),
  );
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/admin/monitoring");
    await expect(
      page.getByRole("heading", { name: "Service status" }),
    ).toBeVisible();
    await expect(
      page.getByText("Catalog fallback", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".dash-stat").filter({ hasText: "Requests" }).first(),
    ).toContainText("42");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
