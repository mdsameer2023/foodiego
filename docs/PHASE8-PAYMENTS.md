# Payment release audit and separate live activation checklist

## Current decision

**TEST MODE ONLY. LIVE ACTIVATION BLOCKED.** No payment was charged or refunded through Razorpay during Phase 8. Missing test credentials are not fabricated. The current backend rejects every non-`rzp_test_` key ID; enabling live mode requires a separately reviewed code/configuration change, not just replacing a secret.

## Code audit and local evidence

| Area | Finding |
| --- | --- |
| Provider order creation | Backend recalculates paise from MongoDB; validates provider amount/currency/ID and scoped order ownership |
| Browser signature | HMAC SHA-256 on stored provider-order ID and payment ID, constant-time comparison, then server fetch of provider payment |
| Capture | Requires captured state, matching amount/order/currency; transactional finalization; unique provider payment/order IDs protect duplicates |
| Webhook | Raw JSON bytes before parser, independent secret, HMAC and event ID validation, persisted replay tracking; business changes idempotent |
| Refunds | ADMIN only, reason/audit record, cancelled captured order, idempotency key and reserved amount prevent over-refund |
| Refund uncertainty | Timeout keeps PENDING reservation; webhook or administrator reconciliation can resolve; do not blindly issue again |
| Reconciliation | Customer status poll fetches provider payments; administrator refund listing fetches remote refunds; external delivery is not verified |
| COD | Owned address, server totals and transaction/idempotency verified locally; no cash collection/remittance/settlement ledger is implemented |

All production-required unique indexes are included by the corrected 19-model migration. The migration was tested only on temporary databases; the configured database passed a read-only index audit.

## Operational gaps that block a paid launch

- Provider order creation can crash after a local CREATED reservation or before saving its remote ID. There is no scheduled orphan-recovery process; manual triage and a reviewed recovery design are needed.
- Abandoned online checkouts can retain coupon reservations. No scheduled expiry/release worker is present. Do not assume a browser close releases them.
- Payment reconciliation is request/webhook driven, not an independent durable worker. Define stale-payment detection, ownership and recovery before launch.
- The SDK adapter does not set an explicit application HTTP timeout; review bounded network behavior with a compatible SDK change and failure tests before enabling live payments. No unsafe automatic retries for order/refund creation should be added.
- Delivery completion changes order status but does not settle COD paymentStatus or remit cash. Define and verify an audited cash collection/settlement procedure before live COD fulfillment; do not silently mark cash paid from delivery status.
- Real signature/capture/webhook/refund behavior, merchant KYC and dashboard settings remain NOT VERIFIED. Mocked tests are not provider certification.

## Authorized Razorpay TEST verification (future staging only)

- [ ] Owner enables TEST dashboard mode; backend-only TEST key/secret and separate webhook signing secret configured privately.
- [ ] Exact HTTPS callback `/api/payments/webhook` registered; required payment capture/failure and refund processed/failed events selected.
- [ ] Create a staging-only checkout with synthetic data/test instrument; match local order, provider order, amount and INR.
- [ ] Verify pending/authorized state is not shown as paid; capture finalizes exactly one order.
- [ ] Invalid browser signature/foreign payment ID/wrong amount/currency rejected; cart remains on failed checkout.
- [ ] Deliver the real provider TEST webhook, replay it and verify no duplicate side effects. A curl-generated HMAC is only a local protocol check.
- [ ] Confirm status polling recovers a captured checkout after the callback/browser is interrupted.
- [ ] Cancel an eligible staging order, request ADMIN-only TEST refund, verify processed/failed state and dashboard reconciliation; customer/owner/partner refund attempts denied.
- [ ] Exercise refund timeout/duplicate request and preserve reservation until provider truth is known.
- [ ] Test operational alerts and manual handling of stale CREATED/PENDING reservations.

## Separate future LIVE activation checklist — NOT authorized now

- [ ] Complete provider-required business/KYC/account activation in the merchant dashboard; retain evidence privately.
- [ ] Resolve COD/payment recovery gaps and complete all TEST scenarios first.
- [ ] Separately review the code-level live-key prohibition, mode separation, provider account binding, request timeouts, callbacks and safeguards.
- [ ] Obtain explicit written launch/payment approval. This document is not approval.
- [ ] Provision LIVE secrets through backend secret management only, with an independent LIVE webhook secret and exact HTTPS endpoint.
- [ ] Define capture/refund/settlement reconciliation, reviewer permissions, incident ownership, daily ledger comparison and alerting.
- [ ] Approve any minimum real-money verification separately; no such charge is authorized by Phase 8.
- [ ] Record rollback/disable procedure, monitor the first approved transactions, and retain test/live separation.

Until those gates are completed, leave online payments disabled or in TEST mode. Do not change credentials or restrictions as part of this audit.
