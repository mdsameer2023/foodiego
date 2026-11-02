import "dotenv/config";
import { loadEnv } from "../src/config/env.js";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import {
  aiSettings,
  GeminiProvider,
  requestAi,
} from "../src/services/ai/gemini.service.js";
import { modelOutput } from "../src/services/ai/ai-validation.js";
import { createAssistant } from "../src/services/ai/assistant.service.js";
import { recommendationInput } from "../src/services/ai/ai-validation.js";
try {
  const settings = aiSettings();
  if (process.env.GEMINI_LIVE_TEST !== "1") {
    console.log("NOT RUN: Set GEMINI_LIVE_TEST=1 explicitly for a live provider smoke test.");
    process.exitCode = 1;
  } else if (!settings.apiKey || !settings.model) {
    console.log(
      "NOT VERIFIED: GEMINI_API_KEY and GEMINI_MODEL must be configured locally.",
    );
    process.exitCode = 1;
  } else {
    await connectDatabase(loadEnv().MONGODB_URI);
    const provider = new GeminiProvider(settings);
    await provider.verify();
    const output = modelOutput.parse(
      await requestAi(
        provider,
        JSON.stringify({
          limit: 1,
          constraints: { city: "Kolkata" },
          candidates: [
            {
              id: "000000000000000000000001",
              name: "Verification sample",
              pricePaise: 10000,
              allowedReasons: ["MATCH"],
            },
          ],
        }),
        settings,
      ),
    );
    if (output.recommendations[0]?.id !== "000000000000000000000001")
      throw new Error("Invalid verification response");
    console.log(
      "PASS: Configured Gemini model is accessible and returned validated structured output. This verification sample is not a catalog recommendation.",
    );
    const result = await createAssistant(provider, settings)(recommendationInput.parse({
      city: "Kolkata", message: "Recommend available food", explainWithAi: true, limit: 2,
    }));
    if (!result.cards.length) {
      console.log("BLOCKED: No matching open catalog dishes for an end-to-end Gemini recommendation smoke test.");
      process.exitCode = 1;
    } else if (result.mode !== "gemini") {
      console.log("FAIL: Live catalog recommendation returned fallback; no catalog response data was printed.");
      process.exitCode = 1;
    } else console.log("PASS: Live Gemini ranked existing MongoDB dishes and the backend revalidated catalog facts.");
  }
} catch {
  console.error(
    "NOT VERIFIED: Gemini SDK, model access, credentials, network or budget validation failed. No secrets were logged.",
  );
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
