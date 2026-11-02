import { z } from "zod";
import { AiUsage } from "../../models/AiUsage.js";
import { logger } from "../../utils/logger.js";
import { assistantInstruction } from "./prompt-builder.js";
import { modelOutput } from "./ai-validation.js";

export type AiSettings = {
  apiKey?: string;
  model?: string;
  timeoutMs: number;
  dailyRequests: number;
  dailyTokens: number;
  retentionMinutes: number;
};
export function aiSettings(): AiSettings {
  const data = z
    .object({
      GEMINI_API_KEY: z.string().optional(),
      GEMINI_MODEL: z.string().trim().max(120).optional(),
      AI_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1000)
        .max(30000)
        .default(10000),
      AI_DAILY_REQUEST_LIMIT: z.coerce
        .number()
        .int()
        .min(0)
        .max(100000)
        .default(200),
      AI_DAILY_TOKEN_LIMIT: z.coerce
        .number()
        .int()
        .min(0)
        .max(10000000)
        .default(500000),
      AI_CHAT_RETENTION_MINUTES: z.coerce
        .number()
        .int()
        .min(1)
        .max(60)
        .default(15),
    })
    .parse(process.env);
  return {
    apiKey: data.GEMINI_API_KEY,
    model: data.GEMINI_MODEL || "gemini-3.8-flash",
    timeoutMs: data.AI_TIMEOUT_MS,
    dailyRequests: data.AI_DAILY_REQUEST_LIMIT,
    dailyTokens: data.AI_DAILY_TOKEN_LIMIT,
    retentionMinutes: data.AI_CHAT_RETENTION_MINUTES,
  };
}
export type ProviderResult = {
  value: unknown;
  inputTokens: number;
  outputTokens: number;
};
export interface AiProvider {
  verify(): Promise<void>;
  generate(prompt: string, signal: AbortSignal): Promise<ProviderResult>;
}
type SdkClient = InstanceType<typeof import("@google/genai").GoogleGenAI>;
export class GeminiProvider implements AiProvider {
  private client: SdkClient | null = null;
  private verifiedUntil = 0;
  constructor(private settings: AiSettings) {}
  private async sdk() {
    if (this.client) return this.client;
    if (!this.settings.apiKey || !this.settings.model)
      throw new Error("AI_NOT_CONFIGURED");
    // Loaded only on the server when configured. A missing SDK never disables
    // the deterministic catalog or prevents the rest of the app from starting.
    const sdk = await import("@google/genai");
    this.client = new sdk.GoogleGenAI({
      apiKey: this.settings.apiKey,
      httpOptions: {
        timeout: this.settings.timeoutMs,
        retryOptions: { attempts: 1 },
      },
    });
    return this.client;
  }
  async verify() {
    if (this.verifiedUntil > Date.now()) return;
    const client = await this.sdk();
    const model = await client.models.get({
      model: this.settings.model!,
      config: { httpOptions: { timeout: this.settings.timeoutMs } },
    });
    if (
      model.supportedActions?.length &&
      !model.supportedActions.some((action) =>
        action.toLowerCase().includes("generatecontent"),
      )
    )
      throw new Error("AI_MODEL_UNSUPPORTED");
    this.verifiedUntil = Date.now() + 5 * 60000;
  }
  async generate(prompt: string, signal: AbortSignal) {
    await this.verify();
    const client = await this.sdk();
    const response = await client.models.generateContent({
      model: this.settings.model!,
      contents: prompt,
      config: {
        systemInstruction: assistantInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(modelOutput),
        maxOutputTokens: 600,
        temperature: 0,
        automaticContinuation: false,
        abortSignal: signal,
        automaticFunctionCalling: { disable: true },
      },
    });
    if (!response.text) throw new Error("AI_EMPTY_OUTPUT");
    return {
      value: JSON.parse(response.text),
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
    };
  }
}
export function usageDay() {
  return new Date().toISOString().slice(0, 10);
}
export async function reserveAiRequest(settings: AiSettings) {
  const day = usageDay();
  try {
    await AiUsage.updateOne(
      { day },
      { $setOnInsert: { expiresAt: new Date(Date.now() + 30 * 86400000) } },
      { upsert: true },
    );
  } catch (error) {
    if (!(
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === 11000
    ))
      throw error;
  }
  const reserved = await AiUsage.findOneAndUpdate(
    {
      day,
      requests: { $lt: settings.dailyRequests },
      $expr: {
        $lt: [
          { $add: ["$inputTokens", "$outputTokens"] },
          settings.dailyTokens,
        ],
      },
    },
    { $inc: { requests: 1 } },
    { returnDocument: "after" },
  );
  if (reserved && reserved.requests >= settings.dailyRequests * 0.8)
    logger.warn(
      {
        event: "ai_budget_threshold",
        requests: reserved.requests,
        limit: settings.dailyRequests,
      },
      "AI request budget approaching limit",
    );
  return Boolean(reserved);
}
export async function requestAi(
  provider: AiProvider,
  prompt: string,
  settings: AiSettings,
) {
  const signal = AbortSignal.timeout(settings.timeoutMs);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) throw new Error("AI_TIMEOUT");
    if (!(await reserveAiRequest(settings))) throw new Error("AI_BUDGET_LIMIT");
    try {
      const result = await new Promise<ProviderResult>((resolve, reject) => {
        const abort = () => reject(new Error("AI_TIMEOUT"));
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener("abort", abort, { once: true });
        void provider
          .generate(prompt, signal)
          .then(resolve, reject)
          .finally(() => signal.removeEventListener("abort", abort));
      });
      await AiUsage.updateOne(
        { day: usageDay() },
        {
          $inc: {
            inputTokens: Math.max(0, result.inputTokens),
            outputTokens: Math.max(0, result.outputTokens),
          },
        },
      );
      return result.value;
    } catch (error) {
      await AiUsage.updateOne({ day: usageDay() }, { $inc: { failures: 1 } });
      const status =
        typeof error === "object" && error && "status" in error
          ? Number(error.status)
          : 0;
      if (
        attempt === 1 ||
        ![429, 500, 502, 503, 504].includes(status) ||
        signal.aborted
      )
        throw new Error(status ? "AI_PROVIDER_UNAVAILABLE" : "AI_UNAVAILABLE", {
          cause: error,
        });
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw new Error("AI_UNAVAILABLE");
}
