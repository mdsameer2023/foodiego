import { z } from "zod";
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const recommendationInput = z
  .object({
    message: z.string().trim().max(2000).default(""),
    city: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[\p{L}\p{M}\s.'-]+$/u)
      .default("Kolkata"),
    cuisine: z.string().trim().max(60).optional(),
    maxPrice: z.number().positive().max(100000).optional(),
    dietary: z.enum(["any", "vegetarian", "non-vegetarian"]).default("any"),
    personalize: z.boolean().default(false),
    preferredCuisines: z
      .array(z.string().trim().min(1).max(60))
      .max(10)
      .default([]),
    section: z
      .enum([
        "recommended",
        "similar",
        "frequent",
        "budget",
        "trending",
        "discover",
      ])
      .default("recommended"),
    restaurantId: objectId.optional(),
    explainWithAi: z.boolean().default(false),
    limit: z.number().int().min(1).max(8).default(6),
  })
  .strict();
export const chatInput = recommendationInput.extend({
  message: z.string().trim().min(2).max(2000),
});
export type RecommendationInput = z.infer<typeof recommendationInput>;
export const modelOutput = z
  .object({
    recommendations: z
      .array(
        z
          .object({
            id: objectId,
            reason: z.enum([
              "MATCH",
              "BUDGET",
              "POPULAR",
              "PREFERENCE",
              "FAST",
              "DISCOVER",
            ]),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type ModelOutput = z.infer<typeof modelOutput>;
export type FoodCard = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  name: string;
  description?: string;
  image: string;
  pricePaise: number;
  rating: number;
  reviewCount: number;
  deliveryMinutes: number;
  vegetarian: boolean;
  cuisines: string[];
  reason: string;
  reasonCodes: string[];
  score: number;
  href: string;
};
export function validateSelection(value: unknown, candidates: FoodCard[]) {
  const output = modelOutput.parse(value),
    known = new Map(candidates.map((row) => [row.id, row]));
  const seen = new Set<string>();
  return output.recommendations.map((result) => {
    const card = known.get(result.id);
    if (
      !card ||
      seen.has(result.id) ||
      !card.reasonCodes.includes(result.reason)
    )
      throw new Error("Unverified recommendation");
    seen.add(result.id);
    return card;
  });
}
