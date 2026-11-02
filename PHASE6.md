# Phase 6 workspaces

The workspaces reuse cookie authentication, CSRF, order transitions, payment/refund services, and delivery tracking. Customer pages keep their existing layout. Open `/dashboard` to route to the signed-in account's workspace.

## Routes

- Administrators: `/admin`, then `/restaurants`, `/users`, `/orders`, `/payments`, `/refunds`, `/deliveries`, `/coupons`, `/reviews`, `/analytics`, `/settings`, `/audit-logs` under that root.
- Restaurant owners: `/restaurant-dashboard`, then `/orders`, `/menu`, `/categories`, `/analytics`, `/reviews`, `/offers`, `/settings`.
- Delivery partners: `/delivery-dashboard`, then `/assignments`, `/active-delivery`, `/earnings`, `/history`, `/profile`.

Backend workspace APIs use `/api/admin`, `/api/owner`, and `/api/partner`. Every prefix authenticates and checks the role. Owner queries resolve owned restaurant IDs on the server. Partner history and earnings always use the authenticated partner ID. Existing `/api/payments`, `/api/orders`, and `/api/deliveries` services remain authoritative for operational changes.

## Operations and data

- Restaurant approvals, rejection, suspension and reactivation enforce state transitions. Legacy approval flags remain compatible. Restaurants are not deleted.
- User status and role changes require an administrator, confirmation and reason. Administrator accounts cannot be suspended or demoted using these controls. Public signup cannot provision privileged roles.
- Owner menu changes validate category ownership, prices, image URLs and customization constraints. Item deletion archives availability, preserving historical order snapshots. Categories containing menu items cannot be deleted.
- Review moderation records a reason and recalculates ratings from visible reviews. Customer review queries exclude hidden reviews.
- Refund requests use the existing provider-confirmed refund workflow. No dashboard operation marks payments captured or refunds processed manually.
- Delivery reassignment is limited to uncollected deliveries and releases the previous partner inside a transaction.
- Delivery completion requires a server-validated six-digit customer code. The customer requests the code from the order page when the order is on its way. Codes expire after 10 minutes; five incorrect attempts lock the code. Only the order customer can request it. Only its assigned partner can verify it. Completion stops location sharing. The generic order-status endpoint cannot bypass completion verification.
- AuditLog records administrative changes and sensitive owner menu/settings operations. It contains no passwords, tokens or provider secrets.
- Workspace Socket.IO rooms are selected from authenticated server roles and account IDs. Polling reconciles missed updates.
- Logout disconnects the authenticated session's Socket.IO connections. Order broadcasts recheck session validity and current ownership before sending data.

## Financial definitions

- Gross order value sums confirmed checkout totals, including cancelled orders. It is not platform revenue.
- Completed sales sum delivered order totals before online refunds.
- Captured online principal includes only CAPTURED, REFUNDED and PARTIALLY_REFUNDED payment attempts. Failed attempts are excluded.
- Processed refund totals include only provider-confirmed PROCESSED refunds.
- Owner daily/weekly/monthly sales charts use completed sales; cancelled order values do not contribute to them. Payment-method distribution and delivery-completion trend charts use backend aggregation results.
- Delivery earnings are estimates, using `DELIVERY_ESTIMATE_PAISE` (default 5000 paise per completed delivery). No payouts are represented as paid. Day/week/month charts and date filters are available.

## Optional configuration

Only example configuration has been extended. Actual environment files are not overwritten.

- Backend `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: enables validated JPEG/PNG/WebP uploads, maximum 4 MB. Secrets remain server-side. Without these variables, use existing image URLs.
- Backend `DELIVERY_ESTIMATE_PAISE`: integer estimate per completed delivery; not a payout rate or provider transfer.
- Existing Razorpay test keys, webhook HTTPS endpoint and browser map key remain external setup. Real gateway transactions/refunds/webhook delivery are deferred at the user's request. No production payments are enabled.

## Schema changes

Added AuditLog. Extended Restaurant with management status, status reason and contact phone; Review with visibility and moderation reason; DeliveryAssignment with hidden completion-code hash, expiry, attempt count and verification timestamp. Added date indexes on orders and delivery history. Existing documents remain compatible; no destructive migration is needed.

## Verification

Completion review against the original prompt added the payment-method distribution chart and delivery-completion trend chart, corrected owner sales charts to use delivered-order totals, and revoked active session sockets on logout. The final responsive production recheck passed for all three roles at all four breakpoints.

Final local results:

| Check | Result |
| --- | --- |
| Backend regression suite | 28 passed (final completion review) |
| Final Phase 6 targeted tests, including cancellation cleanup | 9 passed |
| Frontend unit tests | 4 passed |
| Full browser regression suite | 19 passed, 1 optional live-commerce test skipped |
| Final Phase 6 production browser tests | 8 passed |
| Final chart/layout production recheck | 3 role tests passed at all four breakpoints |
| Backend and frontend TypeScript/lint | Passed |
| Backend and frontend production builds | Passed |
| Responsive layouts | Verified at 320, 768, 1024 and 1440 pixels |

The final production browser run used a temporary isolated server on port 3001; its temporary configuration was removed after verification. Screenshots are saved in `frontend/test-results/phase6-*.png` and use mocked test data. Actual application analytics use MongoDB aggregations, not these fixtures.

Backend integration tests use temporary isolated MongoDB databases. Phase 6 tests cover role denial, user suspension, protected admin accounts, restaurant transitions and audit records, owner isolation, menu/category validation, financial aggregation, moderation, coupon restrictions, and partner earnings isolation. Existing Phase 5 tests exercise delivery code validation and customer-only code access. Browser tests cover workspace layouts at 320, 768, 1024 and 1440 pixels, customer access denial, administrative confirmation and partner code entry.

Cloudinary delivery, browser GPS/map-provider rendering and real Razorpay operations require configured external services and are not claimed verified by mocked browser tests.

## Source files in this phase

Created:

- `backend/src/models/AuditLog.ts`
- `backend/src/controllers/dashboard-upload.ts`
- `backend/src/routes/dashboards.ts`
- `backend/src/services/delivery-cancellation.ts`
- `backend/tests/phase6.test.ts`
- `frontend/src/components/dashboard/workspace.tsx`
- `frontend/src/app/admin/[section]/page.tsx`
- `frontend/src/app/restaurant-dashboard/page.tsx`
- `frontend/src/app/restaurant-dashboard/[section]/page.tsx`
- `frontend/src/app/delivery-dashboard/page.tsx`
- `frontend/src/app/delivery-dashboard/[section]/page.tsx`
- `frontend/e2e/phase6.spec.ts`
- `PHASE6.md`

Modified:

- `backend/.env.example`
- `backend/src/app.ts`
- `backend/src/models/Restaurant.ts`
- `backend/src/models/Review.ts`
- `backend/src/models/Order.ts`
- `backend/src/models/DeliveryAssignment.ts`
- `backend/src/controllers/reviews.ts`
- `backend/src/controllers/auth.ts`
- `backend/src/controllers/restaurants.ts`
- `backend/src/controllers/orders.ts`
- `backend/src/controllers/deliveries.ts`
- `backend/src/controllers/payments.ts`
- `backend/src/services/realtime.ts`
- `backend/tests/phase5.test.ts`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/next.config.ts`
- `frontend/src/app/globals.css`
- `frontend/src/app/admin/page.tsx`
- `frontend/src/app/dashboard/page.tsx`
- `frontend/src/components/layout/shell.tsx`
- `frontend/src/components/deliveries/partner-deliveries.tsx`
- `frontend/src/components/orders/order-detail.tsx`
- `frontend/src/services/deliveries.ts`

## Workspace API map

| Scope | APIs |
| --- | --- |
| Admin analytics | `GET /api/admin/dashboard`, `/analytics`, `/settings` |
| Admin lists | `GET /api/admin/restaurants`, `/users`, `/orders`, `/payments`, `/refunds`, `/deliveries`, `/partners`, `/coupons`, `/reviews`, `/audit-logs` |
| Admin details | `GET /api/admin/users/:id`, `/restaurants/:id` |
| Restaurant operations | `PATCH /api/admin/restaurants/:id/status`, `/owner` |
| Account operations | `PATCH /api/admin/users/:id/status`, `/role` |
| Partner verification | `PATCH /api/admin/partners/:id`; reuse `POST /api/deliveries/partners` for profile provisioning |
| Delivery reassignment | `POST /api/admin/deliveries/:id/reassign` |
| Coupons | `POST /api/admin/coupons`, `PATCH /api/admin/coupons/:id`; owner equivalents enforce restaurant ownership |
| Moderation | `PATCH /api/admin/reviews/:id/visibility` |
| Owner data | `GET /api/owner/dashboard`, `/analytics`, `/restaurants`, `/orders`, `/menu`, `/categories`, `/reviews`, `/offers` |
| Owner order actions | `PATCH /api/owner/orders/:id/status`, `POST /api/owner/orders/:id/reject` |
| Owner menu | `POST /api/owner/menu/items`; `PATCH`, `DELETE /api/owner/menu/items/:id` |
| Owner categories | `POST /api/owner/categories`; `PATCH`, `DELETE /api/owner/categories/:id` |
| Owner settings/upload | `PATCH /api/owner/restaurants/:id/settings`, `POST /api/owner/images` |
| Partner data | `GET /api/partner/dashboard`, `/analytics`, `/assignments`, `/deliveries`, `/earnings`, `/history`, `/profile` |
| Partner actions | `POST /api/partner/assignments/:id/accept`, `/reject`; existing delivery pickup/start/location/complete routes remain authoritative |
| Partner profile | `PATCH /api/partner/profile` |
| Customer delivery code | `POST /api/deliveries/order/:orderId/completion-code` |

List APIs accept bounded pagination and applicable search/status/date filters. Analytics accepts `period=day|week|month` and `from`/`to`; owners may select an owned `restaurantId`. Financial values named `Paise` use integer paise. The customer delivery code is never returned by partner/admin list endpoints.
