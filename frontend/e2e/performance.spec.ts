import { test, expect } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
test.skip(
  process.env.FOODIEGO_MEASURE_PERFORMANCE !== "1",
  "Explicit lab performance run",
);
test("record lab navigation, LCP, CLS and assistant opening time", async ({
  browser, baseURL,
}) => {
  const results: unknown[] = [];
  for (const width of [375, 1440]) {
    const context = await browser.newContext({viewport:{width,height:950},baseURL});
    const page = await context.newPage();
    await page.addInitScript(() => {
      const metrics = { lcpMs: 0, cls: 0, shifts: [] as {value:number;nodes:string[]}[] };
      let sessionStart=0, lastShift=0, sessionValue=0;
      Object.assign(window, { foodiegoLabMetrics: metrics });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcpMs = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!shift.hadRecentInput) {
            if (entry.startTime-lastShift>1000 || entry.startTime-sessionStart>5000) {sessionStart=entry.startTime;sessionValue=0;}
            lastShift=entry.startTime;sessionValue+=shift.value;
            metrics.cls=Math.max(metrics.cls,sessionValue);
            const sources=(entry as PerformanceEntry & {sources?:{node?:Element}[]}).sources||[];
            metrics.shifts.push({value:shift.value,nodes:sources.map(source=>source.node?.className||source.node?.nodeName||'unknown').map(String).slice(0,4)});
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/");
    await expect(page.locator(".hero-food")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".hero-food")
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(1500);
    const navigation = await page.evaluate(() => {
      const timing = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming;
      return {
        ...(
          window as unknown as {
            foodiegoLabMetrics: { lcpMs: number; cls: number };
          }
        ).foodiegoLabMetrics,
        domContentLoadedMs: timing.domContentLoadedEventEnd,
        transferBytes: performance
          .getEntriesByType("resource")
          .reduce(
            (sum, entry) =>
              sum + (entry as PerformanceResourceTiming).transferSize,
            0,
          ),
      };
    });
    const start=Date.now();
    await page.getByRole("button",{name:"Open FoodieGo food assistant"}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const assistantOpenMs=Date.now()-start;
    results.push({ width, ...navigation, assistantOpenMs });
    await page.getByRole("button", { name: "Close assistant" }).click();
    await context.close();
  }
  await mkdir("test-results", { recursive: true });
  const label = (process.env.FOODIEGO_PERFORMANCE_LABEL || "after").replace(
    /[^a-z0-9_-]/gi,
    "",
  );
  await writeFile(
    `test-results/performance-${label}.json`,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        type: "Lab measurements; assistantOpenMs is not field INP. LCP/CLS are browser observations, not a Lighthouse or CrUX score.",
        results,
      },
      null,
      2,
    ),
  );
});
