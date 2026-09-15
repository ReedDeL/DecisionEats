# DecisionEats — Phase 1 Scaling, Legal Safety & Limits

**Status:** Implemented
**Date:** September 9, 2026
**Scope:** First production-safety phase for the local-first app

This is an engineering record, not legal advice. It records the controls now in
the repository and the decisions that still require product, privacy, or legal
approval.

## Current position

The main Now, Plan, and Pantry journeys are local-first and use the bundled
catalog. The photo path is the first material external-cost path: one request
can send up to ten compressed images through the `analyze-pantry-photo` Edge
Function to Gemini.

The initial operating target remains **5,000–10,000 monthly active users**
without a backend architecture change. This is a planning estimate, not a load
test or vendor guarantee. Anonymous static visitors can be higher; authenticated
sync and photo-heavy users consume hosted quotas sooner.

## Implemented in Phase 1

### Server-side cost and abuse limits

- Added `private.pantry_scan_global_usage`, a private RLS-protected UTC-day
  ledger.
- Replaced the per-user-only claim with an atomic two-limit claim guarded by a
  transaction advisory lock. A scan is granted only when both the per-user and
  global budgets have capacity.
- Added conservative operator configuration:
  - `DAILY_SCAN_LIMIT`: default `20`, maximum `100` per user per UTC day.
  - `GLOBAL_DAILY_SCAN_LIMIT`: default `1000`, maximum `100000` per UTC day.
- Invalid limit configuration fails closed before any Gemini request.
- Unverified Supabase accounts receive `403` and cannot spend photo-analysis
  quota. The client maps this to a clear recovery message.

### Privacy-safe failure behavior

- Gemini error response bodies are consumed but no longer logged or returned.
- Model output is no longer included in validation-error logs.
- Auth failure logs no longer include the user identifier.
- The existing `store: false` request remains, but documentation now explains
  that it does not override provider-tier retention, abuse-monitoring, or
  data-use terms.

### User-facing safety disclosure

The scan screen and Settings now say that:

- Photos are sent to a third-party photo-recognition provider.
- DecisionEats does not save photos after the request.
- Users should not include people, documents, or personal details.
- Scan results must be reviewed and are not medical or allergy-safety advice.

## Required production configuration

Set these as Supabase Edge Function secrets or hosted function environment
variables; never use `EXPO_PUBLIC_` names:

```text
ALLOWED_ORIGINS=https://the-exact-production-origin.example
DAILY_SCAN_LIMIT=20
GLOBAL_DAILY_SCAN_LIMIT=1000
```

`ALLOWED_ORIGINS` should contain exact deployed web origins. Keep it unset only
for local development or a deliberate non-browser deployment.

## Operational gates

Move from the Free plan or add capacity work when any of these occur:

- More than 10,000 MAU.
- More than 300,000 photo-function calls in a month.
- More than 300 MB of database storage.
- More than 700,000 analytics events in a month.
- Repeated p95 latency above the product target or 5xx/timeout growth.
- Gemini usage approaching the approved monthly budget.

Supabase currently lists 50,000 MAU, 500 MB database storage, and 500,000
monthly Edge Function invocations on Free. Pro currently includes 100,000 MAU,
8 GB database storage, and 2 million Edge Function invocations. Recheck vendor
limits before every launch decision:

- [Supabase pricing](https://supabase.com/pricing)
- [Supabase Edge Function usage](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations)
- [Supabase database size](https://supabase.com/docs/guides/platform/database-size)

## Next scaling phases

### Phase 2 — before 25,000 MAU or broad cloud sync

- Move to Supabase Pro with backups and a spending policy.
- Measure database growth and add retention for temporary or historical data.
- Load-test catalog RPCs and replace nested hot-path work with a versioned read
  model or cache if needed.
- Use a paid Gemini service tier after a provider data-use review.

### Phase 3 — 50,000+ MAU or heavy photo usage

- Process scans asynchronously through a queue with concurrency limits,
  retries, TTL-based image cleanup, and per-user/device/IP/global budgets.
- Add a global cost circuit breaker and an operator dashboard.
- Separate catalog reads from user-state writes if either becomes a bottleneck.

### Phase 4 — 100,000+ MAU or high-consequence operation

- Add formal SLOs, restore drills, incident response, security testing, and a
  vendor/subprocessor register.
- Revisit database topology, read replicas, archival, and enterprise support.

## Legal and privacy follow-ups

These are not claimed complete by this implementation:

1. Approve an adult-use policy and decide whether an actual age gate is needed.
   The verified-email check is an abuse control, not age verification.
2. Use a Gemini service tier whose data-use terms are acceptable for food
   photos, allergies, dietary restrictions, and any future body-profile data.
   Google's [Gemini API terms](https://ai.google.dev/gemini-api/terms) should be
   reviewed alongside the privacy notice.
3. Publish a complete privacy notice covering collection, purpose, retention,
   deletion, export, vendors, and breach response. Review whether the FTC
   [Health Breach Notification Rule](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0)
   applies to the product's data flows.
4. Keep Spoonacular optional and comply with its [API terms](https://spoonacular.com/food-api/terms)
   if it is enabled.
5. Verify catalog attribution, license, modification, and share-alike duties,
   including the [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
   source material.

## Verification

`npm run check` now includes `npm run test:supabase`, which runs structural
checks for the catalog and pantry-scan safety contracts. The live RLS script
also covers global-ledger isolation, per-user limits, cross-user global limits,
and anonymous refusal:

```bash
npm run check
psql "$DATABASE_URL" -f supabase/tests/rls_verification.sql
```
