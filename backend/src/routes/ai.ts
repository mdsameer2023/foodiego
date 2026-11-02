import { Router } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { User } from "../models/User.js";
import { RefreshSession } from "../models/RefreshSession.js";
import { AiUsage } from "../models/AiUsage.js";
import { verifyAccess } from "../services/auth.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { Env } from "../config/env.js";
import { createAssistant } from "../services/ai/assistant.service.js";
import {
  chatInput,
  recommendationInput,
} from "../services/ai/ai-validation.js";
import {
  aiSettings,
  usageDay,
  type AiProvider,
  type AiSettings,
} from "../services/ai/gemini.service.js";

export function aiRoutes(
  env: Env,
  options: { aiProvider?: AiProvider | null; aiSettings?: AiSettings } = {},
) {
  const router = Router(),
    settings = options.aiSettings || aiSettings(),
    assistant = createAssistant(options.aiProvider, settings);
  router.get("/suggestions", (_req, res) =>
    res.json({
      data: {
        questions: [
          "Suggest vegetarian food under ₹200",
          "Find biryani in my city",
          "Show affordable restaurants",
          "Find food with fast delivery",
        ],
        retentionMinutes: settings.retentionMinutes,
      },
    }),
  );
  router.get(
    "/status",
    requireAuth(env),
    requireRole("ADMIN"),
    async (_req, res) =>
      res.json({
        data: {
          configured: Boolean(settings.apiKey && settings.model),
          model: settings.model || null,
          providerVerified: false,
          usage: await AiUsage.findOne({ day: usageDay() })
            .select("-_id -__v")
            .lean(),
          dailyRequestLimit: settings.dailyRequests,
          dailyTokenLimit: settings.dailyTokens,
          conversationStorage: "none",
        },
      }),
  );
  router.use(async (req, res, next) => {
    if (req.cookies?.fg_access)
      try {
        const payload = verifyAccess(req.cookies.fg_access, env);
        if (
          await RefreshSession.exists({
            sessionId: payload.sid,
            userId: payload.sub,
            expiresAt: { $gt: new Date() },
          })
        )
          res.locals.aiUser = await User.findOne({
            _id: payload.sub,
            isActive: true,
          }).select("_id");
      } catch {
        /* Anonymous catalog recommendations remain available. */
      }
    next();
  });
  const limit = rateLimit({
    keyGenerator: (req, res) => res.locals.aiUser?._id
      ? `user:${res.locals.aiUser._id.toString()}`
      : `ip:${ipKeyGenerator(req.ip || "127.0.0.1")}`,
    windowMs: 60000,
    limit: 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "AI_RATE_LIMIT",
        message: "Please wait a minute before asking again.",
      },
    },
  });
  router.post("/chat", limit, async (req, res) => {
    const input = chatInput.parse(req.body);
    input.explainWithAi = true;
    res.json({ data: await assistant(input, res.locals.aiUser?._id) });
  });
  router.post("/recommendations", limit, async (req, res) =>
    res.json({
      data: await assistant(
        recommendationInput.parse(req.body),
        res.locals.aiUser?._id,
      ),
    }),
  );
  return router;
}
