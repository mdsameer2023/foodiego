# FoodieGo API

Base URL: `http://localhost:5000/api`. Responses use `{ "data": ... }`; list endpoints may include `meta`. Errors use `{ "error": { "code": "...", "message": "..." } }`, with validation `issues` when relevant. Cookie-authenticated browser requests must send credentials.

Before any `POST`, `PATCH`, or `DELETE`, call `GET /auth/csrf`, retain its `data.csrfToken`, and send it as `X-CSRF-Token`. The endpoint sets the matching CSRF cookie. Cross-origin browsers must be hosted at `FRONTEND_URL`.

| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Health response |
| GET | `/auth/csrf` | Public | CSRF token |
| POST | `/auth/register` | Public | Create CUSTOMER account `{name,email,password,phone?}` |
| POST | `/auth/login` | Public | Login `{email,password}` |
| POST | `/auth/logout` | Cookie | Revoke current session |
| POST | `/auth/refresh` | Refresh cookie | Rotate refresh token |
| GET | `/auth/me` | Access cookie | Current user |
| POST | `/auth/forgot-password` | Public | Request reset `{email}` |
| POST | `/auth/reset-password` | Public | Consume single-use token `{token,password}` |
| GET | `/users/profile` | Access cookie | Profile |
| PATCH | `/users/profile` | Access cookie | Update `{name?,phone?,avatar?}` |
| PATCH | `/users/change-password` | Access cookie | Change `{currentPassword,newPassword}`; revokes sessions |
| GET | `/users/addresses` | Access cookie | Own addresses |
| POST | `/users/addresses` | Access cookie | Add address |
| PATCH | `/users/addresses/:id` | Access cookie | Update own address |
| DELETE | `/users/addresses/:id` | Access cookie | Remove own address |
| GET | `/users/favorites` | Access cookie | Saved approved restaurants |
| POST | `/users/favorites` | Access cookie | Save `{restaurantId}`; idempotent |
| DELETE | `/users/favorites/:restaurantId` | Access cookie | Remove saved restaurant |
| GET | `/restaurants` | Public | Approved restaurants, filtered/paginated |
| GET | `/restaurants/search?q=` | Public | Restaurant, food, cuisine suggestions |
| GET | `/restaurants/cuisines` | Public | Approved restaurant counts by cuisine |
| GET | `/restaurants/:id` | Public | Approved restaurant |
| GET | `/restaurants/:id/menu` | Public | Available menu items/categories |
| GET | `/restaurants/:id/menu/categories` | Public | Menu category navigation |
| GET | `/restaurants/:id/menu/items` | Public | Filtered, paginated menu items |
| GET | `/menu-items/search?q=` | Public | Food name search |
| GET | `/menu-items/trending` | Public | Popular available dishes |
| GET | `/restaurants/:id/reviews` | Public | Paginated reviews |
| POST | `/restaurants/:id/reviews` | Access cookie | Review `{rating,comment}` |
| PATCH | `/reviews/:id` | Owner cookie | Edit own review |
| DELETE | `/reviews/:id` | Owner cookie | Delete own review |
| GET | `/cart` | Access cookie | Current cart with authoritative item prices and totals |
| POST | `/cart/items` | Access cookie | Add `{menuItemId,quantity,selections,specialInstructions}` |
| PATCH | `/cart/items/:itemId` | Access cookie | Change quantity (0 removes) or instructions; `itemId` is the cart line key |
| DELETE | `/cart/items/:itemId` | Access cookie | Remove a cart line |
| DELETE | `/cart` | Access cookie | Clear cart |
| GET | `/coupons/available` | Access cookie | Coupons currently eligible for the cart |
| POST | `/coupons/validate` | Access cookie | Validate `{code}` and return a fresh quote |
| POST | `/checkout/quote` | Access cookie | Price cart with optional `{code,addressId}` |
| POST | `/orders` | Access cookie | Place COD order `{addressId,code?,deliveryInstructions,paymentMethod:"COD",idempotencyKey}` |
| GET | `/orders` | Access cookie | Own orders, `page`, `limit`, optional `status` |
| GET | `/orders/:id` | Owner cookie | Own order snapshot and status timeline |
| POST | `/orders/:id/cancel` | Owner cookie | Cancel eligible order `{reason}` |
| POST | `/orders/:id/reorder` | Owner cookie | Add available old items to cart `{replaceExisting}` |
| PATCH | `/orders/:id/status` | Authorized staff | Validated status transition `{status}` |
| PATCH | `/orders/:id/assign-partner` | Admin cookie | Assign an active delivery partner `{partnerId}`; assignment is audited |

Address input: `fullName`, `phone` (10-digit Indian mobile), `addressLine1`, `city`, `state`, `postalCode` (6 digits), and optionally `addressLine2`, `landmark`, `latitude`, `longitude`, `addressType` (`HOME`, `WORK`, `OTHER`), `isDefault`.

Restaurant list query: `search` (partial, case-insensitive name/cuisine/area/city/menu match), `cuisine`, `city`, `area`, `vegetarian=true`, `pureVegetarian=true`, `offers=true`, `openNow=true`, `priceMax`, `ratingMin`, `deliveryMax`, optional `lat` and `lng` with `radiusKm` (1-50), `sort=recommended|rating|price|priceDesc|time|reviews|name`, `page` (from 1), and `limit` (1-30). `meta` includes page, limit, total, and pages. Only approved restaurants are returned. Seeded rows include `isSample: true`.

Menu item query: `category` (category ID or name), `search`, `vegetarian=true`, `popular=true`, `sort=name|price|priceDesc`, `page`, and `limit` (1-50). Reviews support `sort=newest|rating`, `page`, and `limit` (1-30). Any authenticated customer may leave one review per restaurant without a purchase during this demo phase; review creation is rate-limited and edits/deletions require ownership.

Registration is rate-limited, rejects unknown fields including `role`, and always assigns `CUSTOMER`. Login and reset endpoints are also rate-limited. Password hashes and reset/refresh tokens are never returned in JSON. Password reset links are delivered by configured SMTP or logged in development console mode only.

Money amounts in cart, coupon, quote, order, payment, and refund responses use integer paise. Restaurant-specific `deliveryFeePaise`, `packagingFeePaise`, `taxRateBasisPoints`, and `codEnabled` determine checkout eligibility and totals. If a restaurant has not configured a fee or tax, its default is zero. Cart item `selections` is an array of `{group,options:[name]}` matching configured menu customization groups. One restaurant is allowed per cart. The server validates current item availability, customization rules, address ownership, and coupon usage during order placement. COD creates the order and clears the cart in a MongoDB transaction. Online checkout retains the cart until trusted provider capture is confirmed. Customers may cancel `PLACED` or `CONFIRMED` orders within 10 minutes while preparation has not started.

## Phase 5 endpoints

All authenticated browser mutations require a CSRF token. Online payment is test mode only. Amounts are authoritative integer paise.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/payments/create-order` | Customer | Validate cart and address, reserve checkout, create Razorpay test order; `{addressId,code?,deliveryInstructions?,idempotencyKey}` |
| POST | `/payments/verify` | Order owner | Verify checkout signature and provider state; `{orderId,razorpayOrderId,razorpayPaymentId,razorpaySignature}` |
| POST | `/payments/webhook` | Signed provider | Raw-body HMAC-verified provider events with replay protection |
| GET | `/payments/:orderId/status` | Order owner | Reconcile and read current payment state |
| POST | `/payments/:paymentId/refund` | Admin | Refund a captured payment on a cancelled order; `{amountPaise,reason,idempotencyKey}` |
| GET | `/payments/:paymentId/refunds` | Admin | Refund audit records; reconcile pending refunds with the provider when reachable |
| POST | `/deliveries/partners` | Admin | Create or verify partner profile |
| POST | `/deliveries/assign` | Admin | Assign an eligible partner to an order |
| GET | `/deliveries/mine` | Partner | Own active assignments |
| GET | `/deliveries/order/:orderId` | Order owner | Assignment and opted-in current location |
| GET | `/deliveries/:id` | Authorized participant | Assignment details |
| POST | `/deliveries/:id/accept`, `/reject`, `/pickup`, `/start`, `/complete` | Assigned partner | Validated delivery transitions |
| POST | `/deliveries/:id/tracking/start`, `/stop`, `/location` | Assigned partner | Opt-in tracking and throttled coordinates |

Socket.IO uses the existing authenticated cookie at `/api/socket.io`. Subscribe with `order:subscribe` and `{orderId}`; access is checked per order. Reconnect by subscribing again and use the returned status history plus REST polling to synchronize missed updates. Customers cannot emit privileged status changes.


## Phase 7 assistant and operational endpoints

All POST assistant requests use existing CSRF protection. Catalog matching supports guests; personalization uses only the authenticated account after explicit opt in. Body fields are strictly validated; arbitrary user IDs, database commands and administrative actions are rejected.

| Method | Endpoint | Authorization / behavior |
| --- | --- | --- |
| POST | `/api/ai/chat` | Bounded message, city, diet/budget and explicit personalization; validated real catalog cards; provider fallback |
| POST | `/api/ai/recommendations` | Deterministic discovery by default; `section` = recommended/similar/frequent/budget/trending/discover |
| GET | `/api/ai/suggestions` | Public fixed suggestions and browser-memory retention policy |
| GET | `/api/ai/status` | ADMIN only; provider configuration and aggregate usage; no keys or conversation data |
| GET | `/api/admin/monitoring` | ADMIN only; per-process operational counters |
| GET | `/api/health/ready` | Public readiness/database status; 503 when unavailable |
| GET | `/api/restaurants/sitemap` | Bounded public approved, non-sample restaurant names/IDs/update times only |

Card prices use integer paise. No model-supplied price, rating, discount or delivery promise is trusted. Model output can only select validated candidate IDs and supported reason codes. Catalog availability and prices are checked again after provider processing, and checkout remains authoritative.

See `docs/AI_SETUP.md`, `docs/TESTING.md` and `docs/DEPLOYMENT.md` for exact setup, verification and deployment constraints.
