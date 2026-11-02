import { test, expect, type Page } from "@playwright/test";
const emptyCart = {
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
};
async function basics(page: Page, role: string) {
  await page.route("http://localhost:*/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill({
        json: {
          data: {
            user: {
              id: "user-test",
              name: "FoodieGo Operator",
              email: "operator@example.invalid",
              role,
              isEmailVerified: true,
            },
          },
        },
      });
    if (path === "/api/auth/csrf")
      return route.fulfill({ json: { data: { csrfToken: "csrf-test" } } });
    if (path === "/api/cart")
      return route.fulfill({ json: { data: emptyCart } });
    if (
      path.endsWith("/analytics") ||
      path.endsWith("/dashboard") ||
      path.endsWith("/earnings")
    )
      return route.fulfill({
        json: {
          data: {
            stats: {
              totalUsers: 12,
              totalOrders: 5,
              grossOrderValuePaise: 250000,
              completedOrders: 3,
              pendingApprovals: 1,
              estimatedEarningsPaise: 15000,
            },
            series: [
              { _id: "2026-10-28", orders: 3, grossOrderValuePaise: 150000,completedSalesPaise:100000,estimatedEarningsPaise:10000 },
              { _id: "2026-10-29", orders: 2, grossOrderValuePaise: 100000,completedSalesPaise:50000,estimatedEarningsPaise:5000 },
            ],
            statuses: [
              { _id: "DELIVERED", count: 3 },
              { _id: "PLACED", count: 2 },
            ],
            methods: [{ _id: "COD", count: 5 }],
            topItems: [{ _id: "Paneer Bowl", quantity: 4, salesPaise: 120000 }],
            performance: [],
            deliveryStats: [],
            deliveryTrends:[{_id:'2026-10-28',completed:2},{_id:'2026-10-29',completed:1}],
            recentOrders: [],
            definitions: {
              grossOrderValuePaise:
                "Gross order value is not platform revenue.",
            },
          },
        },
      });
    if (path.endsWith("/profile"))
      return route.fulfill({
        json: {
          data: {
            id: "profile-test",
            phone: "9999999999",
            isVerified: true,
            isAvailable: true,
          },
        },
      });
    return route.fulfill({
      json: { data: [], meta: { page: 1, pages: 0, total: 0 } },
    });
  });
}
for (const [role, root] of [
  ["ADMIN", "/admin"],
  ["RESTAURANT_OWNER", "/restaurant-dashboard"],
  ["DELIVERY_PARTNER", "/delivery-dashboard"],
]) {
  test(`${role} workspace fits mobile, tablet, laptop and desktop`, async ({
    page,
  }) => {
    await basics(page, role);
    for (const width of [320, 375, 430, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto(root);
      await expect(
        page.getByRole("heading", { name: "Welcome back, FoodieGo." }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Order status", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${root} overflow at ${width}`,
      ).toBe(true);
      if (width === 320 || width === 1440)
        await page.screenshot({
          path: `test-results/phase6-${role}-${width}.png`,
          fullPage: true,
        });
      await page.getByRole("button", { name: "Toggle sidebar" }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}
test("customer cannot render administrator workspace", async ({ page }) => {
  await basics(page, "CUSTOMER");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", {
      name: "You do not have access to this dashboard.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Dashboard navigation" }),
  ).toHaveCount(0);
});
test("administrator suspension requires reason and confirmation dialog", async ({
  page,
}) => {
  await basics(page, "ADMIN");
  let suspended = false;
  await page.route("http://localhost:*/api/admin/users?*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "customer-test",
            name: "Test Customer",
            email: "customer@example.invalid",
            role: "CUSTOMER",
            isActive: !suspended,
          },
        ],
        meta: { page: 1, pages: 1, total: 1 },
      },
    }),
  );
  await page.route(
    "http://localhost:*/api/admin/users/customer-test/status",
    (route) => {
      const body = route.request().postDataJSON();
      expect(body.confirmed).toBe(true);
      expect(body.reason).toBe("Account safety review");
      suspended = true;
      return route.fulfill({ json: { data: { id: "customer-test" } } });
    },
  );
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Account safety review");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved");
  await expect(
    page.getByRole("button", { name: "Reactivate", exact: true }),
  ).toBeVisible();
});
test("partner completion sends customer code and stops at verified delivery", async ({
  page,
}) => {
  await basics(page, "DELIVERY_PARTNER");
  let delivered = false;
  await page.route("http://localhost:*/api/deliveries/mine", (route) =>
    route.fulfill({
      json: {
        data: delivered
          ? []
          : [
              {
                id: "assignment-test",
                orderId: "order-test",
                restaurantId: "restaurant-test",
                assignmentStatus: "ON_THE_WAY",
                trackingEnabled: false,
                assignedAt: new Date().toISOString(),
              },
            ],
      },
    }),
  );
  await page.route(
    "http://localhost:*/api/deliveries/assignment-test/complete",
    (route) => {
      expect(route.request().postDataJSON().code).toBe("123456");
      delivered = true;
      return route.fulfill({ json: { data: { id: "assignment-test" } } });
    },
  );
  await page.goto("/delivery-dashboard/active-delivery");
  const button = page.getByRole("button", { name: "Verify & deliver" });
  await expect(button).toBeDisabled();
  await page.getByLabel("Customer delivery code").fill("123456");
  await button.click();
  await expect(page.getByText("No active deliveries right now.")).toBeVisible();
});
test("owner creates a menu dish with category and customization options", async ({
  page,
}) => {
  await basics(page, "RESTAURANT_OWNER");
  let created = false;
  await page.route("http://localhost:*/api/owner/restaurants", (route) =>
    route.fulfill({
      json: { data: [{ id: "restaurant-test", name: "Test Kitchen" }] },
    }),
  );
  await page.route("http://localhost:*/api/owner/categories?*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "category-test",
            restaurantId: "restaurant-test",
            name: "Recommended",
          },
        ],
        meta: { page: 1, pages: 1, total: 1 },
      },
    }),
  );
  await page.route("http://localhost:*/api/owner/menu/items", (route) => {
    const body = route.request().postDataJSON();
    expect(body.name).toBe("Paneer Bowl");
    expect(body.categoryId).toBe("category-test");
    expect(body.price).toBe(250);
    expect(body.customizationOptions[0].options[0].name).toBe("Regular");
    created = true;
    return route.fulfill({ json: { data: { id: "dish-test" } } });
  });
  await page.goto("/restaurant-dashboard/menu");
  await page.getByRole("button", { name: "Add dish" }).click();
  await page.getByLabel("Dish name", { exact: true }).fill("Paneer Bowl");
  await page.getByLabel("Price (₹)", { exact: true }).fill("250");
  await page.getByRole("button", { name: "Add customization group" }).click();
  await page.getByLabel("Customization group name").fill("Size");
  await page.getByLabel("Option name", { exact: true }).fill("Regular");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved");
  expect(created).toBe(true);
});
test('order payment and review filters are available without any matching rows',async({page})=>{
  await basics(page,'ADMIN');const queries:string[]=[];
  await page.route('http://localhost:*/api/admin/orders?*',route=>{queries.push(route.request().url());return route.fulfill({json:{data:[],meta:{page:1,pages:0,total:0}}});});
  await page.goto('/admin/orders');await page.getByLabel('Payment method filter').selectOption('ONLINE');await page.getByLabel('Payment status filter').selectOption('PAID');await expect.poll(()=>queries.some(url=>url.includes('paymentMethod=ONLINE')&&url.includes('paymentStatus=PAID'))).toBe(true);
  await page.goto('/admin/reviews');await page.getByLabel('Review rating filter').selectOption('4');await expect(page.getByLabel('Review restaurant filter')).toBeVisible();
});
