import { test, expect } from "@playwright/test";
test("homepage images load and desktop/mobile layouts render", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your cravings. Our happy place." }),
    ).toBeVisible();
    await expect(page.locator(".restaurant-card").first()).toBeVisible();
    // Discovery is intentionally loaded only near the viewport.
    await page.getByRole("region", {name:"Food recommendations"}).scrollIntoViewIfNeeded();
    await expect(page.getByLabel("Recommendation dietary preference")).toBeVisible();
    await expect(page.locator(".skeleton")).toHaveCount(0);
    await page.evaluate(() =>
      document
        .querySelectorAll<HTMLImageElement>("img")
        .forEach((image) => (image.loading = "eager")),
    );
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll<HTMLImageElement>("img")].every(
              (image) => image.complete && image.naturalWidth > 0,
            ),
          ),
        { timeout: 60000 },
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
