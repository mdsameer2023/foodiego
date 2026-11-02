# FoodieGo

## Phase 7 assistant and release guides

The food assistant uses real catalog records and supports deterministic fallback without Gemini credentials. The official SDK is installed; live key/model verification is deferred until configured locally.

- [AI setup and privacy](docs/AI_SETUP.md)
- [Testing and isolated browser tests](docs/TESTING.md)
- [Deployment preparation and rollback](docs/DEPLOYMENT.md)
- [Security review](docs/SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

Preserve existing environment files. Copy examples only when the destination does not exist. These guides do not authorize production deployment or live payments.

FoodieGo is a responsive food delivery application with MongoDB-backed carts, COD orders, Razorpay test-mode online checkout, refunds, manual delivery assignment, order updates, and opt-in location sharing. Seeded restaurants are fictional and cannot fulfill real deliveries.

## Requirements and local setup

Use Node.js 24+ and npm. Install dependencies separately in `backend` and `frontend`.

```powershell
cd backend
npm ci
Copy-Item .env.example .env
# Edit .env: set a MongoDB Atlas URI, two independent random 32+ character JWT secrets,
# and FRONTEND_URL/BACKEND_URL matching your local hosts.
npm run seed
npm run dev
```

In a second terminal:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. The backend listens on port 5000 by default. The backend validates required environment variables and connects to MongoDB before accepting requests; it exits on connection failure. See [API documentation](backend/API.md) for endpoints and authentication requirements.

## MongoDB Atlas setup

Create a MongoDB Atlas project and cluster, allow the IP address of the machine running the backend in Network Access, and create a database user with read/write access to the `foodiego` database. Copy its connection string into `backend/.env` as `MONGODB_URI`; URL-encode any special characters in the database password. The application explicitly uses the database name `foodiego` and creates indexes via Mongoose in development. For production, create or verify indexes during deployment before serving traffic. Do not commit `.env` files.

Only the backend needs MongoDB credentials. If Atlas is unreachable, verify network access, the database username/password, and the URI. No Atlas credentials are included in this repository.

## Seed and admin bootstrap

`npm run seed` in `backend` idempotently inserts 30 fictional restaurants, 156 menu items, categories, 60 sample reviews, and three development-only coupons (`FOODIE50`, `SAVE100`, `WELCOME20`). Seeded restaurants and items have `isSample: true`; illustrative photo sources are recorded in [SOURCES.md](frontend/public/images/SOURCES.md). Existing non-sample records are never overwritten. Reruns do not duplicate records. Five older sample image placeholders are updated only when they still match the old sample asset path.

No administrator account is seeded. To create or update one explicitly, set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` (at least 16 characters) in the backend process environment, then run `npm run bootstrap:admin`. Remove those variables after use. Public registration can only create `CUSTOMER` accounts.

## Authentication and email

The API uses 15-minute HTTP-only access cookies and rotated 30-day refresh cookies. Cookies are `Secure` in production; cross-site frontends require HTTPS and compatible cookie settings. Browser mutations require `X-CSRF-Token` from `GET /api/auth/csrf`, plus allowed Origin and credentialed CORS. Do not store tokens in localStorage.

Set `EMAIL_MODE=smtp` and all `SMTP_*` variables to send real reset email. For local testing only, `EMAIL_MODE=console` logs a reset link in the **backend terminal**; no message is sent. With `EMAIL_MODE=disabled`, forgot-password returns 503. Never enable console mode in production. The frontend's generic success message intentionally avoids revealing whether an email account exists.

## Frontend behavior

The existing responsive layout and navigation remain. Login, signup, password reset, profile, addresses, restaurant discovery, menus, favorites, and reviews call MongoDB-backed APIs. Guest carts remain temporarily on the device; after login, the customer chooses whether to merge them. Signed-in carts, coupons, checkout quotes, COD orders, and online payment sessions use the backend. The backend recalculates every item and fee; browser totals are never trusted. FoodieGo sample restaurants cannot fulfill real deliveries.

## Phase 5 setup

For **Razorpay test mode**, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in `backend/.env`. The key ID must start with `rzp_test_`. The secret and webhook secret stay on the backend. Register the public webhook URL ending in `/api/payments/webhook` for payment capture/failure and refund processed/failed events. A local server needs an HTTPS tunnel for external webhooks; browser verification and server-side reconciliation still work without one. The frontend receives the public key ID from the backend payment session, so `NEXT_PUBLIC_RAZORPAY_KEY_ID` is optional. Do not put a secret in a `NEXT_PUBLIC_` variable.

The partner page is `/deliveries`; customers can use `/orders/{id}/track`. An administrator must create a verified partner profile and manually assign an eligible order through the API. Location sharing requires the partner's browser permission and an explicit Start action. It stops at delivery completion or when the partner chooses Stop. Configure optional write thresholds with `TRACKING_MIN_INTERVAL_MS`, `TRACKING_MIN_DISTANCE_METERS`, and `TRACKING_STATIONARY_INTERVAL_MS` in the backend environment. Set a restricted `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in the frontend only if you want the map. The status timeline works without a key or geocoded coordinates. Pickup and delivery coordinates must be supplied by real records; no estimated route or location is invented.

## Verification

```powershell
cd backend
npm run typecheck
npm run lint
npm test
npm run build
```

Backend tests use isolated `mongodb-memory-server` databases, including a replica set for transaction tests, and may need to download a MongoDB binary on the first run. They do not touch Atlas. In `frontend`, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`. The Playwright configuration uses installed Microsoft Edge. The commerce browser test runs with a temporary database under `FOODIEGO_E2E_ISOLATED=1`; the separate Atlas run requires `FOODIEGO_LIVE_E2E=1` and cleans up its temporary account and records. The environment file examples are safe templates and contain no secrets.

## Scope

Phase 5 adds test-mode payments and minimal partner controls. Production payments and a full analytics dashboard remain outside this phase. External gateway checkout, webhooks, map rendering, and live device GPS require the corresponding test credentials and infrastructure for end-to-end verification.


## Phase 7 verification and operations

See [PHASE7.md](PHASE7.md) for current results and limits, [AI setup](docs/AI_SETUP.md) for backend-only Gemini configuration and explicit smoke testing, [testing](docs/TESTING.md) for isolated browser runs, and [deployment](docs/DEPLOYMENT.md) for the approval and rollout procedure. Live provider verification is separate from automated mocked-provider tests.


## Phase 8 release audit

See [PHASE8.md](PHASE8.md) for verified results and the NO-GO launch decision, [release runbook](docs/PHASE8-RUNBOOK.md) for exact approval-gated GitHub/Vercel/Render steps and recovery, and [payment checklist](docs/PHASE8-PAYMENTS.md) for TEST mode and separate future live activation. Nothing has been deployed.
