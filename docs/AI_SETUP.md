# FoodieGo food assistant

The assistant uses a deterministic MongoDB retrieval pipeline. It does not create orders, change carts, issue refunds, execute model-generated database queries or administer accounts.

## Current integration boundary

The official `@google/genai` SDK is installed in the backend and recorded in its package manifest and lockfile. Live key/model and existing-catalog recommendation smoke tests passed on 2026-10-31. Catalog fallback works without provider credentials.

From `backend`:

```powershell
npm ci
```

This installs the SDK version already recorded in the backend lockfile. Commit neither credentials nor actual `.env` files. The existing local credentials were preserved.

When ready, set these backend environment variables locally or in the hosting secret manager:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
GEMINI_LIVE_TEST=0
AI_TIMEOUT_MS=10000
AI_DAILY_REQUEST_LIMIT=200
AI_DAILY_TOKEN_LIMIT=500000
AI_CHAT_RETENTION_MINUTES=15
```

Choose a model available to the account; `GEMINI_MODEL` overrides the supported default `gemini-3.8-flash`. Set `GEMINI_LIVE_TEST=1` in the verification process environment, then run `npm run ai:verify`. The flag is required to prevent accidental live testing. It checks model access and a small structured response using clearly labeled verification data. It also ranks existing Kolkata catalog records and revalidates facts. It does not insert a pretend dish into the catalog. A successful metadata lookup alone does not demonstrate successful content generation.

## Retrieval, grounding and fallback

1. Validate the request with Zod. Only explicit city, cuisine, budget, dietary choice and bounded message fields are accepted.
2. Parse supported constraints and query approved, open restaurants with available menu items. Candidate queries are bounded.
3. Optionally rank using the signed-in account's own favorites and delivered-order cuisines, only with explicit consent. Guests and new users use catalog matching.
4. Pass only normalized constraints and a bounded candidate catalog to the provider. Raw messages, restaurant descriptions, account identities, order history, addresses, passwords and payment details are excluded.
5. Request structured candidate IDs and allowed reason codes. No provider-generated prices, ratings, business facts, free-form explanations or action instructions are rendered.
6. Reject unknown IDs, duplicates, unknown fields and unsupported reasons. Re-fetch catalog facts after provider processing so stale prices or availability are not trusted.
7. Return human-readable explanations derived from actual validated catalog facts. Missing credentials, SDK, timeout, provider failure, quota exhaustion and invalid output fall back to deterministic catalog recommendations.

Medical, allergen and vegan ingredient suitability is not established by the catalog. The assistant asks the customer to confirm suitability with the restaurant rather than asserting unsupported ingredient facts.

## Privacy and cost

- Conversations exist only in the current browser component's memory. No conversation collection, local storage or server transcript exists. Reset, closing the assistant, account change or configured inactivity expiry clears the conversation.
- Personalization is off by default. Turning it on only authorizes the account's own relevant signals; other accounts' data is never read for this purpose.
- Current limits are per-process authenticated-user request throttling (IP fallback for guests) plus shared MongoDB daily provider-request and observed-token counters. Provider calls reserve a daily request slot atomically.
- SDK retries and automatic continuation are disabled; application retries are bounded and use backoff only for transient provider statuses.
- Timeouts do not guarantee cancellation of provider-side billing. Token metrics record observed SDK usage; provider billing is authoritative, especially for aborted calls. Configure account-side spend alerts in Google AI Studio/Cloud where supported.
- No raw prompts, conversation text or credentials are added to application logs.

## API

- `POST /api/ai/chat`: CSRF-protected guest or signed-in chat; attempts Gemini when configured, otherwise returns catalog fallback.
- `POST /api/ai/recommendations`: deterministic discovery by default; supported sections are recommended, similar, frequent, budget, trending and discover. Provider explanation is opt in via `explainWithAi`.
- `GET /api/ai/suggestions`: fixed suggested questions and browser retention policy.
- `GET /api/ai/status`: administrator-only configuration/usage status; never returns the API key and never claims a provider was verified when it was not.

Prices are integer paise. Cards link to real catalog records. The existing checkout remains the final authority on availability, fees, coupons and totals.

References: [official Google SDK](https://github.com/googleapis/js-genai), [structured output configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html), [HTTP retry options](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html).

The default model follows the [official model catalog](https://ai.google.dev/gemini-api/docs/models); availability is verified against the configured account. Conversation history intentionally remains ephemeral browser memory; MongoDB stores only usage counters and existing opt-in preference signals, not raw chat transcripts. Dish explanations quote bounded restaurant-provided descriptions and never infer ingredients.
