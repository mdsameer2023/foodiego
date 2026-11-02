# Deployment preparation — not a deployment approval

No production deployment has been performed. `render.yaml` and `frontend/vercel.json` are configuration templates. Production auto deployment is disabled in the backend blueprint; CI has no deployment credentials or deployment job.

## Prepare services

1. Use MongoDB Atlas with a dedicated application database user and replica-set transactions. Restrict network access to the hosting provider's egress addresses/private connectivity. Avoid an unrestricted allow list as a permanent configuration.
2. Create a persistent Node.js backend service (Render or equivalent), rooted at `backend`. Build with `npm ci --include=dev && npm run build`; start with `npm start`. Socket.IO must run on this persistent HTTP server, not an ephemeral serverless function.
3. Configure Vercel with project root `frontend`, `npm ci --include=dev`, `npm run build`, and the Next.js framework.
4. Prefer frontend/API custom domains under the same registrable domain. Independent hosting-provider domains require cross-site cookies; browser third-party cookie restrictions can prevent authentication. Test the actual deployed browser configuration before approval.
5. Keep a single backend instance until a supported Socket.IO adapter, room propagation and load-balancer affinity are implemented and tested. In-memory monitoring counters are per instance; AI quotas are shared via MongoDB.

## Required environment

Backend:

- `NODE_ENV=production`, hosting-provided `PORT`.
- `FRONTEND_URL`: exact HTTPS frontend origin, with no trailing path.
- `BACKEND_URL`: exact HTTPS public API origin, without `/api`.
- `MONGODB_URI`: secret Atlas connection string; application database is `foodiego`.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: strong independent secrets; preserve them during routine rollbacks.
- `TRUST_PROXY_HOPS`: exact trusted proxy count; Render's configured service topology normally uses one. Verify the actual topology rather than trusting arbitrary forwarded headers.
- Configure existing SMTP variables and `EMAIL_MODE=smtp` if password-reset email is required. Console email is prohibited in production. Disabled email does not provide password-reset delivery.
- Optional Gemini, Cloudinary, Razorpay test and delivery-estimate settings are listed in `backend/.env.example` and the AI guide. Never prefix backend secrets with `NEXT_PUBLIC_`.

Frontend:

- `NEXT_PUBLIC_API_URL=https://your-api-domain/api`.
- `NEXT_PUBLIC_SITE_URL=https://your-frontend-domain` for canonical links, Open Graph and sitemap URLs.
- Optional restricted browser Maps key and public Razorpay TEST key ID only. The frontend normally obtains the public checkout key ID from the backend payment session.

Production URL validation requires HTTPS. CORS accepts only the configured frontend/backend origins. Do not use a wildcard with credential cookies. Existing auth cookies remain HttpOnly; cross-site cookies require Secure and SameSite=None.

## Payments, uploads and AI

- Remain in Razorpay TEST mode. The backend rejects live key IDs. Configure the exact public HTTPS `/api/payments/webhook` URL and a private webhook signing secret. Do not enable production payments as part of deployment setup.
- Real Razorpay transaction, refund and delivered-webhook verification remains deferred at the user's request.
- Configure Cloudinary secrets server-side and test a permitted image upload. The API validates size and image magic bytes; it does not accept SVG uploads.
- The official Gemini SDK is installed. Local model/content/catalog verification passed in Phases 7 and 8; deployed connectivity remains NOT VERIFIED. Configure backend-only secrets and explicitly set `GEMINI_LIVE_TEST=1` for `npm run ai:verify`.

## Health, monitoring and graceful shutdown

- Liveness: `/api/health`.
- Readiness: `/api/health/ready`, including a database ping; non-ready returns 503 without exposing connection details.
- Administrator diagnostics: `/api/admin/monitoring` and `/api/ai/status`.
- Collect structured logs and alert on `operational_failure`, `ai_fallback`, `ai_budget_threshold`, repeated 5xx/readiness failures and webhook errors. Configure provider-native uptime and spend alerts. Optional Sentry is not installed or claimed configured.
- SIGTERM/SIGINT closes Socket.IO/HTTP connections, disconnects MongoDB and uses a bounded shutdown deadline.

## Database/index rollout

`npm run db:indexes` ensures declared indexes for all 19 existing models, including User, Cart, Payment, Refund and RefreshSession. It creates indexes only; it does not call `syncIndexes`, drop indexes/collections or overwrite user records. Review execution on production data during an appropriate maintenance window. The AiUsage TTL removes only old usage metrics, not customer data.

Do not run seed scripts against production. The isolated E2E server ignores external MongoDB URLs and uses a temporary replica set.

## Approval and rollback

Before publishing, require successful local/CI gates, configure all required secrets, verify real browser cookie/CORS behavior, readiness, order flows, webhook delivery, model access and uploads, and obtain explicit deployment approval.

Rollback by promoting the previous successful frontend deployment and redeploying the previous backend artifact. Keep compatible environment settings and JWT secrets. This phase adds compatible fields/indexes; do not drop customer collections to roll back. Verify readiness, login, catalog reads and existing order/payment status after rollback.

Remote GitHub Actions, Render/Vercel builds, external uptime probes and rollback execution are not verified merely by preparing these files.


Phase 8 adds local schema validation and explicit automatic-deployment disablement for both providers. See [Phase 8 runbook](PHASE8-RUNBOOK.md) and the root [audit report](../PHASE8.md) for approval gates, exact steps and remaining operational gaps. A Vercel import or manual deploy may start a deployment even though Git auto-deployment is disabled; do not perform either before approval.
