# Phase 7 security review

## Verified design controls and targeted fixes

The dependency audit identified high-severity GHSA-27r3-jxmh-p828 in transitive body-parser. A targeted compatible update was applied without package scripts; npm reported zero remaining vulnerabilities after that update. Frontend audit also reported zero findings.

- Existing cookie authentication and server-side role/ownership checks remain authoritative. AI endpoints cannot select another user ID or invoke administrative tools.
- Recommendation candidates must be approved/open/available and satisfy validated constraints. Model output cannot set a price, rating, discount or delivery time. Unknown IDs/fields/reasons fall back; current catalog facts are rechecked after provider processing.
- Model prompts exclude raw conversations, descriptions, account identifiers, history, addresses and payment data. Rendering uses React text nodes; structured data escapes `<` before JSON-LD script insertion.
- Personalization is opt in. User-specific recommendation cache keys include the account ID. Chat is cleared on account changes and is never written to local storage or a server transcript collection.
- JSON parse errors now return 400, oversized bodies 413, without logging submitted payloads or exposing stack traces.
- Socket subscriptions recheck the current session/account and handle errors safely. Existing broadcasts recheck ownership/session, and logout disconnects the session's sockets.
- Partner assignment listing now batches order/restaurant reads and caps active results, avoiding one query per assignment for each related entity.
- Production origins must use HTTPS. CORS remains explicit, credentials are not returned to arbitrary origins, and trusted-proxy depth is configurable.
- Existing image validation, refund authorization/limits, raw-body webhook signatures, payment idempotency and delivery verification remain in place and are regression tested.
- Frontend security headers include nosniff, strict referrer policy and frame denial. A strict nonce-based CSP is not claimed implemented; enforcing one requires verified Razorpay/Maps integration behavior.

## Logging and observability

Request log serialization strips query strings and excludes request bodies/credentials. AI logs contain event codes, result counts and mode, not messages or prompts. Operational error counters and readiness are available without exposing connection strings. Provider billing and external alert delivery require host/account setup.

## Database changes

Added AiUsage with unique day keys and a 30-day metrics retention timestamp; TTL deletes usage metrics only. Added compound catalog, availability/price and consented history query indexes. `npm run db:indexes` creates indexes without dropping existing indexes or records. No production migration or destructive cleanup is automatically run.

## Release checklist

- [ ] Confirm locked dependency audits have no unresolved high/critical findings.
- [ ] Run all isolated backend and browser gates.
- [ ] Verify account/session and role changes in the deployed browser origin/cookie configuration.
- [ ] Restrict Atlas networking and use a least-privileged database account.
- [ ] Configure HTTPS domains and accurate reverse-proxy trust.
- [ ] Verify real Gemini model access, quotas and account-side spend alerts when enabled.
- [ ] Verify real Razorpay test transactions/refunds/webhooks when the deferred integration is resumed.
- [ ] Verify Cloudinary uploads and opt-in GPS/map behavior on real devices.
- [ ] Configure operational alerts, retention and rollback procedures.
- [ ] Obtain explicit deployment approval.

Unchecked items are release gates, not claims of completed production verification. This is an application review and targeted testing effort, not an independent penetration-test certification.


## 2026-10-31 verification update

Fresh locked dependency audits reported zero high/critical findings after a compatible `follow-redirects` update to 1.16.2. Backend: 11 moderate findings; frontend: 16 moderate findings. Every affected installed path is marked development-only in its package lock. The remaining advisories affect ESLint/minimatch tooling; do not treat this as a zero-vulnerability audit. Suggested breaking downgrades were not applied. Review upstream fixes before processing untrusted repositories in build/lint jobs.

Reports: `docs/performance/backend-audit-2026-10-31.json` and `docs/performance/frontend-audit-2026-10-31.json`. Advisory references: https://github.com/advisories/GHSA-mrwp-f3q8-3g9p and https://github.com/advisories/GHSA-g3hv-75wg-m249.

Live Gemini structured-output and existing-catalog ranking smoke tests passed with explicit process opt-in. This does not verify deployed cookies, external alert delivery, production quotas or provider billing. Raw chats remain ephemeral; no chat collection was added.


## Phase 8 update

See [audit](../PHASE8.md) and `docs/phase8/` evidence. Fresh audits retain 0 high/critical and 11 backend/16 frontend moderate development-tool findings. All-model production index coverage, WebSocket upgrade origin restriction and safe error serialization were added and tested. Hosted frontend builds reject secret variables and invalid public URLs. This is a local release audit, not an independent penetration test or hosted certification. Production launch remains NO-GO pending documented external and operational gates.
