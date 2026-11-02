# Phase 8 deployment, smoke, recovery and launch runbook

Status: PREPARATION ONLY. No deployment, DNS change, live payment activation or backup restore has been performed. Every operation below involving a remote service is a future operator action after explicit approval. Replace uppercase placeholders; never paste secret values into chat, Git or reports.

## 1. GitHub and remote CI

The current workspace has no `.git` directory/remote. The connected GitHub account did not expose a FoodieGo repository; the owner confirmed none is configured. Remote CI is **NOT VERIFIED**.

After repository publication is authorized:

```powershell
# Repository root; review files before committing
 git init -b main
 git add .
 git diff --cached --name-only
# STOP if any actual .env, secret file, node_modules, .next*, dist or private test artifact is staged.
 git commit -m "Prepare FoodieGo production readiness gates"
# Create a private EMPTY repository through GitHub first. Replace OWNER below.
 git remote add origin https://github.com/OWNER/foodiego.git
 git push -u origin main
```

The `.gitignore` ignores actual `.env*` files and allows examples only. Scan staged contents privately for credentials before the commit; a filename-only check is insufficient. Do not initialize Git or publish remotely as part of this audit without authorization.

In GitHub Actions, inspect the **FoodieGo quality checks / verify** run for this exact commit SHA. The workflow uses Node 24, locked installs, type/lint checks, backend integration tests, frontend units/build, high/critical audits, Chromium and isolated database browser regression. Its browser artifacts are retained seven days; no deployment job or production secrets are present. The opt-in performance measurement is skipped unless enabled; record it separately rather than claiming a CI performance score. Configure main-branch protection to require this job and reviews. Record run URL, SHA, runner, Node version, conclusion and artifact IDs. Do not substitute this Windows/Node 26 local pass for a Linux/Node 24 pass.

## 2. Isolation and environment checklist

Use a separate staging Atlas cluster and dedicated least-privileged database user, separate JWT secrets, Razorpay TEST credentials and staging hosting projects. **The backend forces database name `foodiego`; changing only the URI's database path does not isolate staging.** Do not connect staging to the production cluster expecting a different URI path to protect data.

| Setting | Location | Required value/action |
| --- | --- | --- |
| NODE_ENV | Render | production |
| NODE_VERSION | Render | 24 (verify hosted build against local Node 26 difference) |
| PORT | Render | Provider-assigned port; do not hardcode 5000 on the host |
| MONGODB_URI | Backend secret manager | Dedicated target cluster/user; never a frontend variable |
| JWT_ACCESS_SECRET / JWT_REFRESH_SECRET | Backend secret manager | Independent strong secrets; preserve through rollback |
| FRONTEND_URL | Render | Exact authorized HTTPS frontend origin, no path/trailing slash |
| BACKEND_URL | Render | Exact HTTPS API origin, no /api path |
| TRUST_PROXY_HOPS | Render | Verify actual proxy topology; template is 1 |
| NEXT_PUBLIC_API_URL | Vercel build | https://API_HOST/api, no query/trailing slash |
| NEXT_PUBLIC_SITE_URL | Vercel build | https://FRONTEND_HOST |
| GEMINI_API_KEY / GEMINI_MODEL | Backend only | Existing account-accessible configured model; optional default documented in AI_SETUP |
| AI_TIMEOUT_MS / AI_DAILY_REQUEST_LIMIT / AI_DAILY_TOKEN_LIMIT | Backend | Review traffic/budget limits and provider spend alerts |
| EMAIL_MODE / SMTP_* | Backend | Verified smtp for password recovery; disabled means recovery unavailable |
| RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET | Backend | TEST only, private secrets; omit keys to disable online checkout |
| CLOUDINARY_* | Backend | Optional upload credentials, verify upload before offering it |
| NEXT_PUBLIC_GOOGLE_MAPS_API_KEY | Vercel | Optional restricted browser key; timeline works without a map |

Prefer HTTPS frontend/API domains under the same registrable domain. Independent Vercel/Render default domains can encounter browser third-party-cookie blocking. Auth cookies are host-only, HttpOnly, Secure in production; cross-host cookies use SameSite=None. Test actual Chrome/Edge/Safari behavior. Never weaken Secure, CORS or CSRF to bypass a deployment problem.

## 3. Atlas and indexes before serving traffic

1. Confirm organization/project ownership, tier, region, least-privileged application user and hosting egress allow list/private connectivity. Do not permanently open 0.0.0.0/0 as a workaround.
2. Record snapshot/PITR retention and last successful backup. Restore to a **different isolated cluster**, never over an active database. Verify a representative account/order relationship, index inventory and application readiness. Record measured restore time, restore point and approved RPO/RTO. Targets (for owner approval): RPO 15 minutes, RTO 60 minutes; neither is verified here.
3. Existing local target database passed read-only `npm run release:database` (19 models). Run the same check against the approved target via its secret manager without printing the URI.
4. A fresh production database has autoIndex disabled. Before admitting traffic, explicitly approve/run `npm run db:indexes` from backend in a trusted deployment terminal; compiled equivalent is `node dist/scripts/migrate-phase7-indexes.js`. It calls createIndexes for all 19 models, never syncIndexes/drop/delete. Unique conflicts stop rollout; do not delete records to force it through. Existing declared TTL indexes retain their normal expiry semantics. No migration was run against Atlas during this audit.
5. Re-run the read-only index audit. If the hosting plan supports a pre-deploy command, the operator may configure the reviewed compiled migration after approval; it is not automatically enabled in this template.

Atlas control-plane/backups were **BLOCKED** through the connector because organization AI client access is disabled. An Organization Owner can enable access or provide dashboard evidence; changing authentication repeatedly will not fix that policy restriction. Backup/restore itself remains **NOT VERIFIED**.

## 4. Render backend — only after deployment approval

1. Link the approved repository/commit to a Node web service, root directory `backend`. Use the reviewed `render.yaml` blueprint or equivalent dashboard settings. Importing a blueprint can create/deploy resources; do not perform this before approval.
2. Build: `npm ci --include=dev && npm run build`. Start: `npm start` (node dist/src/server.js). Build dependencies are explicit because production NODE_ENV can otherwise omit TypeScript. No runtime pruning was added; moderate development-tool advisories remain an acceptance item.
3. Set backend environment variables privately, auto-deploy **off**, health path `/api/health/ready`, and a persistent single instance. Do not place Socket.IO behind an ephemeral serverless handler. Multiple replicas require a verified adapter/affinity strategy before scaling.
4. Gate public traffic until target indexes, approved merchant data, backups and the initial administrator are ready. Bootstrap a dedicated administrator only through the approved secret-manager process; the bootstrap script can update the configured email, so use a deliberate unique account and protect its password. It was not run here.
5. Manually deploy the approved SHA, record deployment ID and run `/api/health` and `/api/health/ready`. Verify TLS, actual proxy IP behavior, allowed/blocked CORS origins, secure cookie attributes and WebSocket `/api/socket.io` upgrades. Record evidence; a schema pass does not verify any of these remotely.

## 5. Vercel frontend — only after deployment approval

1. Import the approved monorepo, root directory `frontend`, Next.js preset, Node 24. Import/manual deployment may start builds; approval is required first.
2. Install: `npm ci --include=dev`; build: `npm run build`; use framework defaults for start/output. Leave FOODIEGO_BUILD_DIR unset on the host.
3. Set the two public HTTPS URLs **before building**. These are compiled values; changing them requires rebuilding. Do not provide backend/Gemini/JWT/payment secrets to the frontend project.
4. Keep `git.deploymentEnabled=false` as supplied. Render auto-deploy is also off. A manual authorized deployment is still possible; these switches are not an approval system.
5. Deploy the same SHA as the backend. Configure domains/TLS and ensure backend FRONTEND_URL matches the final frontend origin. Rebuild if the API URL changes. Verify robots/canonical URLs and private noindex rules.

## 6. Authorized staging smoke worksheet

All rows are **NOT VERIFIED** until an authorized staging URL/isolated target exists. Do not run the general fixture-based E2E suite against production: its fixtures assume a temporary seeded catalog. Local regression is evidence about code, not hosted infrastructure.

Use unique `phase8-UUID@example.invalid` accounts and synthetic addresses, a staging-only restaurant/menu, dedicated admin/owner/partner accounts provisioned through reviewed administrative flows. Disable external fulfillment. Do not create real customer orders or use real payment instruments. Keep evidence private and redact cookies/tokens; retain test record IDs for a separately approved cleanup/archive plan.

| Step | Evidence to collect | Status |
| --- | --- | --- |
| Homepage | HTTP 200, loaded image, no runtime exception | NOT VERIFIED |
| Signup/login/logout/refresh | Customer role, current-user endpoint, Secure/HttpOnly cookies, revoked session | NOT VERIFIED |
| Catalog | Real target MongoDB records, search/filter/menu IDs consistent | NOT VERIFIED |
| Cart | Customization, quantity, one merchant, persistence after reload | NOT VERIFIED |
| Checkout/COD | Owned address, server quote, one idempotent test order persisted | NOT VERIFIED |
| Order history | Own order visible; another user cannot retrieve it | NOT VERIFIED |
| Gemini | Explicit opt-in smoke, mode=gemini, known IDs/current prices, fallback during outage | NOT VERIFIED |
| Admin | Admin succeeds; customer/owner/partner denied | NOT VERIFIED |
| Owner | Own restaurant operations; other restaurant denied | NOT VERIFIED |
| Partner | Assigned delivery only; unassigned partner denied | NOT VERIFIED |
| Tracking | Authorized WebSocket plus REST recovery, origin rejection, opt-in location, stop at completion/cancellation | NOT VERIFIED |
| Razorpay TEST | Only if configured: checkout, captured verification, webhook replay, test refund/reconciliation | NOT VERIFIED |
| Images/email/maps | Real permitted upload, reset email delivery, opt-in physical GPS when enabled | NOT VERIFIED |
| Performance | Deployed mobile/desktop browser metrics under representative network/load | NOT VERIFIED |

Never count a mocked payment or a local Gemini call as a hosted gateway/webhook result. See PHASE8-PAYMENTS.md for detailed provider gates.

## 7. Monitoring, backup and incident operations

These are proposed operator settings, **NOT VERIFIED** delivery integrations:

- Poll readiness each minute; alert after three consecutive failures. Collect safe structured logs with an external host/log service.
- Alert on >1% 5xx over five minutes when at least 20 requests exist, or five absolute failures at low traffic; tune after observed traffic. Alert on repeated payment/webhook failures, pending payments/refunds beyond the approved reconciliation window, and quota/fallback surges.
- Use safe request URL/status logs for `/api/payments/webhook` and authenticated monitoring counters. In-memory counters reset per process; they are not durable audit/billing totals.
- Assign an incident owner, backup operator and payment reviewer before launch. Restrict logs to operators, define retention (proposal: 14 days), and test an alert end to end without sending customer data.
- Confirm backup success daily and perform an approved isolated restore drill before launch and after material data changes. A backup toggle is not a restore test.

Incident sequence: declare severity/owner; preserve redacted logs and deployment IDs; stop new checkout/fulfillment through the reviewed hosting/edge controls; keep verified payment events durable; compare deployed SHA/environment to last known good; use rollback below; reconcile affected orders with provider truth; communicate through approved business channels; record recovery and root cause. Do not delete payment/refund/session collections to recover service.

Credential incident: revoke/rotate only affected secrets through the owner-approved secret manager. JWT rotation invalidates sessions and requires coordinated rollout. Never paste compromised keys into tickets/logs. No rotation was performed here.

## 8. Rollback and launch decision

Record last-good frontend/backend deployment IDs, commit SHA, configuration fingerprint (names only), index report and backup restore point before deployment. On failure:

1. Restrict new checkout/dispatch using pre-reviewed host controls; do not rely on CORS as an access firewall.
2. Promote the known-good Vercel deployment and redeploy the matching Render SHA/artifact. Preserve compatible secrets and database contents. Never blindly restore an old snapshot over newly accepted payments/orders.
3. Leave additive indexes in place; code rollback does not require dropping them. If an index build failed, pause rollout and investigate conflicts privately.
4. Verify readiness, login/current-user, one catalog read, protected-role denials and authorized tracking. Reconcile pending test payments/refunds before resuming checkout.
5. If data recovery is needed, restore to a separate cluster, assess lost/new records and obtain a cutover plan/approval. Record measured RPO/RTO and business sign-off.

Launch only after remote CI for the exact SHA, authorized staging smoke, deployed security/cookie/WebSocket checks, verified backups/restore, monitoring delivery, legitimate merchant data, SMTP recovery and payment/COD operational gates are signed off. Local checks alone do not approve production deployment.
