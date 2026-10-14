# DE-15: Marketing approval and entitlement worksheet

Status: awaiting marketing decisions. No Stripe integration, prices, product IDs,
entitlements, dependencies, checkout links, or production charges were introduced.
The app has guest/account entry and pantry sync work; that is not a billing system.

## Required approval record

Complete one column per approved tier. Blank values are unresolved, not unlimited,
free, or enabled. Proposed tier names are not approval.

| Decision | Base tier | Paid tier A | Paid tier B |
|---|---|---|---|
| Approved public name | Pending | Pending | Pending |
| Price, currency, tax inclusion | Pending | Pending | Pending |
| Billing interval / annual offer | Pending | Pending | Pending |
| Eligible countries / storefronts | Pending | Pending | Pending |
| Scan quota and reset period | Pending | Pending | Pending |
| Other feature entitlements | Pending | Pending | Pending |
| Limit behavior and upgrade messaging | Pending | Pending | Pending |
| Trial eligibility / duration / conversion | Pending | Pending | Pending |
| Cancellation, refund, grace-period rules | Pending | Pending | Pending |
| Upgrade/downgrade timing and proration | Pending | Pending | Pending |
| Existing-user treatment | Pending | Pending | Pending |

Record approver, approval date, version, customer-facing terms, supported platform
scope, support contact, and the exact mapping from feature keys to tier limits.
Safety constraints, pantry corrections and local body-data privacy are never weakened
by a tier. Marketing approval is the prerequisite explicitly required by DE-15.

## Test-mode implementation after approval

1. Create server-owned test products/prices from the approved matrix. Keep the price
   allowlist and feature limits on the server; never trust client amounts or tier names.
2. Authenticate Checkout and portal creation on the server. Bind one billing customer
   to the verified account ID. Reuse that mapping, never a client-provided customer ID
   or email address as ownership proof. Guests must sign in before purchase.
3. Verify webhook signatures over the original raw request body with the test-mode
   signing secret. Store processed event IDs and apply updates transactionally.
4. Handle duplicate delivery idempotently. For out-of-order subscription events,
   reconcile current Stripe subscription state before applying entitlements, including
   cancellation, past-due/grace rules, incomplete checkout, and delayed payment failure.
5. Read entitlements from the server. Checkout return URLs, local storage, and a
   payment-success banner never grant access. Enforce limits at the protected operation.
6. Verify customer portal return URLs and account isolation. Test expiration, cancellation
   at period end, immediate cancellation/refund rules, renewal, plan changes, and retries.

Use a disposable test account for two-user isolation. Tests must reject altered
signatures, wrong environment events, forged customer IDs, client price overrides,
duplicate events, reversed event order, and unauthenticated checkout/portal calls.
Production enablement remains a separate release decision after approved tiers and
the complete test-mode gate. No production API secret is compiled into the client.

## Native purchase boundary, checked against current primary sources

Digital app functionality generally falls under native-store billing rules. Apple's
rules distinguish the US storefront and specific regional entitlements/programs;
Google Play similarly has regional exceptions/program requirements. A working Stripe
web checkout does not authorize offering it in every native storefront.

- [Apple App Review Guidelines, 3.1](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)
- [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)

Recommended initial scope for approval: web test mode. Keep native purchase UI off
until the distribution countries, applicable programs, native product mapping, and
cross-platform entitlement behavior have been reviewed against the policies at release.
This worksheet does not assert eligibility for an exception or program.
