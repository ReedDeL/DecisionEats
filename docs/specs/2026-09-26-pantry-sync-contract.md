# Pantry sync contract (DE-02 first slice)

**Date:** September 26, 2026; verification updated September 27, 2026
**Scope:** Ingredient presence in the Pantry for a guest or signed-in account. Equipment, restrictions, plans, feedback, and onboarding remain separate persistence slices.

## Ownership and bootstrap

A guest pantry is device-local. Signing in does not silently upload it. The existing `on_auth_user_created` trigger creates a household, profile, membership, and empty preferences row for a new auth user. Signed-in ingredient presence lives in `public.inventory` under that household. The unique `(household_id, ingredient_id)` key represents one ingredient type, regardless of brand or repeated taps.

The client resolves the signed-in user's profile and verifies the matching `household_members` row before using its household ID. The profile's `household_id` is a routing hint; the membership row is the authorization source. Inventory RLS grants select, insert, update, and delete only to household members. A signed-in session by itself does not mean the pantry has loaded or saved.

Each device stores its pending pantry operations under a key containing both user ID and household ID. A switch to another user or to guest clears the previous account's visible pantry immediately, then loads the new scope. An old request may finish later; its result must not replace the new scope's view. On upgrade, a hydrated legacy local pantry must stay hidden until identity resolves; preserve any guest copy separately for explicit import. The local Reset action clears the guest stash. For a signed-in account it restores that account pantry projection from its scoped sync state and preserves its queued writes; it does not delete cloud inventory.

## Presence and conflict rules

An explicit add requests presence. It inserts the ingredient if missing and leaves an existing row's quantity, unit, source, and other metadata alone. An explicit delete requests absence. Repeating either request is safe: repeated adds leave one row and repeated deletes leave none. The current slice does not synchronize quantities or reconcile ingredient metadata.

A device renders its local queued intent while a request is pending. The queue records the desired present/absent state and a local revision. A successful server write acknowledges only the matching revision; a newer local action for that ingredient stays queued. Refresh replaces the server base and reapplies outstanding local intents to the visible pantry. The last write *applied by the server* for an ingredient determines server presence when two devices race. There is no cross-device logical clock or tombstone. A delayed queued add can therefore restore an item another device removed. The user can remove it again; this is a known limit of the presence-only slice.

Pending means there are unacknowledged local writes. Synced means the current account has a successful inventory load and its queued writes completed. A successful add or import cannot erase a failed inventory read; Retry must complete a read before the status can become Synced. Error means a load or write failed and needs retry. A network failure keeps the local intent for retry. A permanent authorization or validation error must remain visible rather than be reported as synced; repeatedly retrying it cannot make an unauthorized operation valid. The app refreshes on foreground and at a 30-second interval while active so other devices' completed writes appear without opening Pantry. Errors stay visible until manual Retry or a foreground transition; web also retries on the browser online event. The interval does not retry an errored queue. Native reconnection while the app remains foregrounded therefore requires Retry or leaving and returning to the app; no native connectivity listener is installed in this slice. This slice does not promise instant push updates. On a signed-in cold start without network, the client cannot verify the profile and membership, so it hides the cached pantry until connection returns; this favors account privacy over offline signed-in viewing.

## Guest import

The user chooses whether to import the local guest ingredient set after sign-in. Import is additive: it asks the server to add those ingredients and does not delete anything already in the account pantry. Choosing to keep the guest pantry leaves the account pantry alone. The guest set stays device-local as a stash; import bookkeeping is scoped per account so switching accounts cannot silently import it into another account. An explicit import marks an ingredient as imported for that account once its durable account-scoped outbox entry is saved. Server failure leaves that entry visibly pending or failed and retryable; it does not prompt for a duplicate import after restart. Guest contents are not a second source of truth for signed-in reads.

## Privacy boundary and later slices

This slice sends only canonical ingredient IDs and the account/household identifiers needed for inventory writes. The `bodyGoal` and `bodyMetrics` fields in `src/store/kitchen.ts` keep their local-only promise; pantry sync must never upload them or call `body_profiles` on their behalf.

The existing schema and query functions provide places for later explicit slices: `fetchPreferences`/`updatePreferences` for equipment, allergens, and diet in `user_preferences`; `fetchFeedback`/`recordVerdict` and `fetchTasteSignals`/`recordTasteSignal` for choices; `fetchWeeklyMealPlan`, `createWeeklyMealPlan`, and `replaceWeeklyMealPlanChildren` for plans; `fetchOnboardingProgress`/`saveOnboardingProgress` and `fetchMealReminderPreferences`/`saveMealReminderPreferences` for those settings. Their presence in the database is not evidence that the kitchen store currently synchronizes them. Each needs its own ownership, merge, deletion, and verification rules before wiring it to the app. Body profile persistence needs a separate explicit opt-in design because the current UI promises local storage.

## Verification and evidence boundary

The rollback-only `supabase/tests/pantry_sync_verification.sql` creates random disposable auth users inside a transaction and checks signup bootstrap, authenticated pantry writes, repeat add/delete, cross-user isolation, profile-pointer isolation, and anonymous access. It reports 25 assertions and rolls back. Run it with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pantry_sync_verification.sql`. Its JWT claim phases simulate sessions at the database layer; they are not physical devices. On September 26 and 27, 2026, the live DecisionEats Supabase runs returned 25 PASS results and the transactions rolled back.

The opt-in `src/lib/pantry-sync.live.test.ts` signs in three independent Supabase clients and query caches: two sessions for account A and one for account B. It exercises the production query adapter and controller, refreshes after add/delete, tests B isolation, and checks account switch and sign-out. On September 26 and 27, 2026, this test passed against the live DecisionEats Supabase project using three independent authenticated clients; the disposable users, sessions, and households were removed afterward, with zero fixture users and households remaining. That run verified automated client sessions. The additional September 27 Chrome evidence is described below. Provide an out-of-repository JSON fixture at `PANTRY_SYNC_FIXTURE_PATH` with this shape:

```json
{
  "url": "https://example.supabase.co",
  "key": "publishable-key",
  "a": { "id": "uuid", "email": "disposable-a@example.invalid", "password": "secret" },
  "b": { "id": "uuid", "email": "disposable-b@example.invalid", "password": "secret" }
}
```

Run `PANTRY_SYNC_FIXTURE_PATH=/absolute/path/to/fixture.json npx vitest run src/lib/pantry-sync.live.test.ts` and delete both fixture accounts afterward. The ordinary `npm run check` can collect this test but skips it without the fixture path; `npm run test:supabase` is structural and does not execute the SQL proof. The live test demonstrates separate authenticated clients. Safari and physical-phone behavior remain untested.


### September 27 browser proof

Three isolated headed Chrome contexts used the local Expo web app and real disposable Supabase accounts. A1 and A2 authenticated as the same user; B authenticated as a different user with a different household. Sessions were issued through Supabase email/password auth and loaded using browser storage-state fixtures. This is pantry acceptance evidence, not a Google OAuth or login-screen round trip.

| Check | Observed result |
| --- | --- |
| A1 adds rice | A1 reports synced; A2 receives checked rice through app refresh. |
| B isolation | B stays empty after A's add. B adds pasta; A1 still has rice and no pasta. |
| A2 deletes rice | A1 receives the deletion; B retains its pasta. |
| Offline write and retry | B's disconnected add remains checked with Retry visible. Restoring browser networking saves it and removes Retry. |
| Local body details | Synthetic weight and height entered in A1 remain absent in A2. The database has zero body-profile rows for the fixture users. |
| Sign-out | A1 returns to its guest pantry; local body details remain on the device. |
| Switch scope and guest import | A prepared B session is loaded in A1's browser while preserving its guest oats. B's pasta is loaded, oats remain unchecked, and an explicit import prompt names B. Import adds oats while retaining pasta; B's other context receives oats. |
| Sign-out after import | The original guest oats return; B's account pasta is absent from the guest pantry. |

The auth chat was simultaneously editing login routes in this checkout. Opening sign-in from the returning guest session redirected to Now during this run, so the account-switch setup used a new real B session with preserved guest storage. Live controller tests separately exercise in-flight account changes and guard late responses. This run does not establish login-route acceptance.

Local screenshots and the step-by-step proof are under output/playwright/pantry-sync/ (ignored test artifacts). They include the two A pantries, separate B pantry and identities, propagated deletion, pre-import account switch, and restored guest pantry. Early browser DNS/network interruptions produced visible sync errors; manual Retry recovered before the successful add/delete checks.

The September 27 fixtures were removed after the browser and final independent-client runs; cleanup confirmed zero fixture users and households remaining. The final controller/API and integration subset passed 66 tests, and the complete unit suite passed 934 tests with the opt-in live test skipped in that ordinary run. The opt-in live test passed separately. TypeScript, formatting, and Supabase structural checks passed. In the concurrently edited September 27 checkout, the full project gate was blocked by eight accessibility lint errors in unfinished login/reset screens. That historical result does not describe the isolated pantry release worktree.