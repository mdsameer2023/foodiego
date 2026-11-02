import type { RequestHandler } from "express";
import { logger } from "../utils/logger.js";
const startedAt = new Date();
const counters = {
  requests: 0,
  serverErrors: 0,
  paymentErrors: 0,
  webhookErrors: 0,
  orderErrors: 0,
  slowRequests: 0,
};
export const monitorRequests: RequestHandler = (req, res, next) => {
  const start = performance.now();
  res.on("finish", () => {
    counters.requests++;
    const path = req.originalUrl.split("?")[0] || "",
      duration = performance.now() - start;
    if (duration > 2000) counters.slowRequests++;
    if (res.statusCode >= 500) counters.serverErrors++;
    if (res.statusCode >= 400 && path.startsWith("/api/payments")) {
      counters.paymentErrors++;
      if (path.endsWith("/webhook")) counters.webhookErrors++;
    }
    if (res.statusCode >= 500 && path.startsWith("/api/orders"))
      counters.orderErrors++;
    if (
      res.statusCode >= 500 ||
      (path === "/api/payments/webhook" && res.statusCode >= 400)
    )
      logger.warn(
        {
          event: "operational_failure",
          category: path.startsWith("/api/payments")
            ? "payment"
            : path.startsWith("/api/ai")
              ? "ai"
              : "api",
          status: res.statusCode,
          durationMs: Math.round(duration),
        },
        "Operational request failed",
      );
  });
  next();
};
export function monitoringSnapshot() {
  return {
    startedAt,
    uptimeSeconds: Math.floor(process.uptime()),
    ...counters,
    scope:
      "Current backend process; use external log/uptime monitoring for multi-instance totals.",
  };
}
