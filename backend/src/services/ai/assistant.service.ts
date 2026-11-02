import type { Types } from "mongoose";
import { retrieveFood } from "./food-recommendation.service.js";
import {
  type RecommendationInput,
  validateSelection,
} from "./ai-validation.js";
import { buildPrompt } from "./prompt-builder.js";
import {
  aiSettings,
  GeminiProvider,
  requestAi,
  usageDay,
  type AiProvider,
  type AiSettings,
} from "./gemini.service.js";
import { AiUsage } from "../../models/AiUsage.js";
import { logger } from "../../utils/logger.js";

export function createAssistant(
  provider?: AiProvider | null,
  settings: AiSettings = aiSettings(),
) {
  const gateway =
    provider === undefined && settings.apiKey && settings.model
      ? new GeminiProvider(settings)
      : provider;
  return async (input: RecommendationInput, userId?: Types.ObjectId) => {
    const result = await retrieveFood(input, userId);
    const explanation = /\b(explain|describe|what is|tell me about)\b/i.test(input.message);
    let selected = result.cards.slice(0, input.limit),
      mode: "catalog" | "gemini" | "fallback" = "catalog";
    if (input.explainWithAi && result.cards.length) {
      mode = "fallback";
      if (gateway)
        try {
          const output = await requestAi(
            gateway,
            buildPrompt(input, result.cards),
            settings,
          );
          const validated = validateSelection(output, result.cards).slice(
            0,
            input.limit,
          );
          if (!validated.length) throw new Error("AI_EMPTY_SELECTION");
          // A price, availability or restaurant approval may change while waiting.
          const current = await retrieveFood(input, userId),
            fresh = new Map(current.cards.map((card) => [card.id, card]));
          selected = validated.flatMap((card) =>
            fresh.has(card.id) ? [fresh.get(card.id)!] : [],
          );
          mode = "gemini";
        } catch {
          logger.warn(
            { event: "ai_fallback" },
            "AI unavailable or output failed catalog validation",
          );
        }
      if (mode === "fallback")
        await AiUsage.updateOne(
          { day: usageDay() },
          {
            $inc: { fallbacks: 1 },
            $setOnInsert: { expiresAt: new Date(Date.now() + 30 * 86400000) },
          },
          { upsert: true },
        );
    }
    logger.info(
      {
        event: "food_recommendations",
        mode,
        count: selected.length,
        personalized: Boolean(input.personalize && userId),
      },
      "Food recommendation request completed",
    );
    return {
      mode,
      message:
        result.notice ||
        (explanation && selected[0]
          ? `${selected[0].name}: ${selected[0].description || "The restaurant has not supplied a description for this dish."} Diet label: ${selected[0].vegetarian ? "vegetarian" : "non-vegetarian"}. Ingredient and allergen suitability must be confirmed with the restaurant.`
          : "") ||
        (mode === "fallback"
          ? "Here are matching dishes from the current catalog. The AI service is unavailable, so these results use catalog matching."
          : "Here are available dishes matching your selected preferences."),
      cards: selected.map(({ score, reasonCodes, ...card }) => {
        void score;
        void reasonCodes;
        return card;
      }),
      frequentlyOrderedCuisines: result.frequentCuisines,
      personalized: Boolean(input.personalize && userId),
      retentionMinutes: settings.retentionMinutes,
      disclaimer:
        "Prices shown are item prices before fees and taxes. Availability and totals are checked again at checkout. This assistant cannot place orders or make payments.",
    };
  };
}
