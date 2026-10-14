# DecisionEats feedback roadmap

**Reviewed:** October 12, 2026

**Baseline:** local branch `feat/body-metric-recommendations`, commit `84ce747`

**Status:** Local implementation, audits, and planned work; not a production release. See the [October 12 execution record](reports/2026-10-12-feedback-execution.md) for current checks and remaining release gates.

This is the single active backlog for the September 23 user notes. Product policy
lives in [Product Direction](00_PRODUCT_DIRECTION.md); this file owns the comparison,
work boundaries, acceptance criteria and implementation prompts. Notion mirrors these
same DE IDs. Do not create parallel tasks for the same outcome.

[Notion delivery plan](https://app.notion.com/p/3e46705e950981219eb2fe0fb223e303) links to all 15 matching tasks in the existing launch database. Requirements are reflected in the PRD and Product Vision; the existing Safari acceptance task owns browser release evidence.

## Evidence limits

Auth entry, email action wiring, callback handling, and guest persistence are implemented
in the current worktree. Local browser evidence from September 27, 2026:
- Chrome 153 on Windows and Playwright WebKit 26.5 on Windows loaded the static web
  export at http://127.0.0.1:8098.
- In both engines, Continue as guest opened onboarding and the choice survived a reload
  on the same origin. Switching from 127.0.0.1 to localhost returned to login, consistent
  with browser storage being origin-scoped.
- The OAuth cancellation callback displayed a recovery message. Signup and reset request
  forms rendered; the reset route explained that a recovery link must be opened in the
  requesting browser. Chrome also showed Account and Pantry sync in separate Settings
  sections, and a deliberate account entry from Settings stayed on login. Both engines
  recorded no console errors during the route checks.
- The full `npm run check` gate passes: lint, typecheck, 935 tests passed with one
  live pantry-sync test skipped, Prettier, and Supabase structural checks.
- No real Google/email provider round trip was completed. Hosted Supabase Redirect URLs,
  production deployment, and the final production hostname were not verified. WebKit is
  the Safari engine, not Safari itself; real iPhone Safari remains untested.

The auth choice uses separate storage and does not write or clear kitchen state. The
current worktree also contains pantry-sync implementation and status UI; the local auth
browser checks do not prove cloud sync, account isolation, or release acceptance.
Existing untracked DecisionEats/ content was left untouched.

## Priority and ownership

Priority is a recommendation, not a claim that work is in progress. Status below
separates implemented code from release evidence that remains open. Owners are role
assignments; no individual or deadline has been committed.

1. **First — trust:** DE-01 login/session clarity, DE-02 actual account sync, DE-03 empty pantry.
2. **Next — decisions:** DE-04 ingredient previews, DE-05 manual replacement, DE-07 editable memory.
3. **Then — experience:** DE-06 genres, DE-08 reviewed photos, DE-10 camera,
   DE-12 continuous-onboarding shell, then DE-09 photo preferences and DE-13 reminder verification.
4. **Later — expansion/polish:** DE-11 motion/loading, DE-14 calorie tracking,
   DE-15 billing after marketing decisions. A loading fix necessary for account work stays with that work.

This ordering defers broad visual polish, calorie tracking and monetization behind data
trust. It adds no fixed release date or speculative estimates.

## Compare the notes with current code

| ID | Consolidated request | Current evidence | Priority |
| --- | --- | --- | --- |
| DE-01 | Login, Google OAuth and email/password | Implemented locally; provider and real-device checks open | P0 |
| DE-02 | Account-backed kitchen data and cross-device pantry sync | Implementation present; acceptance evidence tracked separately | P0 |
| DE-03 | Start new pantries empty | Local implementation and guest browser checks pass | P0 |
| DE-04 | Preview missing ingredients before confirming a plan | Local draft preview and unchanged-state browser checks pass | P1 |
| DE-05 | Choose a meal replacement manually | Explicit picker implemented; draft/confirmed single-slot browser checks pass | P1 |
| DE-06 | Food-style breadth and catalog coverage | Coverage audited; shared Now/Plan options; no unsupported additions | P1 |
| DE-07 | Editable dislikes and temporary skips | Local persistence, session expiry, restore, and undo checked | P1 |
| DE-08 | Reviewed real meal photography | Two licensed meal photos with provenance; remaining meals use fallback | P1 |
| DE-09 | Photo-led Now preferences and separate Plan preferences | Local optional photo choices and separate weekly cuisine implemented | P1 |
| DE-10 | Standard camera flip control | Local implementation present; physical switching acceptance open | P1 |
| DE-11 | Skeleton loading and purposeful motion | Shared async skeletons and reduced-motion transitions implemented locally | P2 |
| DE-12 | Complete continuous onboarding; reuse goals and metrics | Shell/photo integration and local browser checks pass | P1 |
| DE-13 | Verify cooking reminders and decide web coverage | Scheduling/date failures fixed; physical delivery open; web unsupported | P1 native verification; P2 web discovery |
| DE-14 | Calorie information and intake tracking | Nutrition audit and two-slice contract complete; implementation pending | P2; data acceptance required |
| DE-15 | Stripe tiers and entitlements | Worksheet complete; marketing inputs pending | P2; blocked on marketing tier decisions |
| DE-16 | Push intended release to production | Local release audit in progress; no deployment | Release gates required |

## Scope and acceptance by work item

### DE-01 — Login, Google OAuth and email/password

- **Current:** The entry screen offers Google, email/password signup and sign-in, password reset, and Continue as guest. Returning local kitchens bypass first-run login; guest choice has its own persistence key. Web callbacks return to the origin that started the flow. Settings separates account identity from pantry sync.
- **Evidence:** Chrome 153 and Playwright WebKit 26.5 local route checks on September 27, 2026; same-origin guest reload and cross-origin reset-to-login observed; returning kitchen stayed available; Settings identity and sync were visibly separate; deliberate account entry remained on login; callback cancellation rendered correctly. No console errors. Full `npm run check` passes (935 passed, one live pantry-sync test skipped).
- **Unverified:** No real provider completion, hosted redirect allowlist/configuration, production deployment, email confirmation/reset round trip, or real iPhone Safari run. See Evidence limits.
- **Owner/model:** App/auth engineer; GPT-6 Sol · medium; Astra if hosted callback diagnosis remains unresolved.
- **Dependencies:** Supabase Auth Redirect URLs must allow the exact callback and reset paths for each origin.
- **Done when:** Keep the current local implementation; verify provider redirects on the deployed origin, email confirmation/reset, session restoration in Chrome and real iPhone Safari, and provider cancellation/errors. Do not label account identity as sync success.

### DE-02 — Account-backed kitchen data and cross-device pantry sync

- **Current:** Pantry sync implementation and its account/status wiring are present in the current worktree. Guest pantry import remains an explicit choice. The auth browser checks above do not establish cross-device delivery or account isolation.
- **Evidence:** Current pantry-sync API/controller/status files and the contract at docs/specs/2026-09-26-pantry-sync-contract.md.
- **Owner/model:** Data/auth engineer; GPT-6 Astra · high for contract; GPT-6 Sol · medium for bounded implementation.
- **Dependencies:** DE-01 session identity; define storage contract before other persistent changes.
- **Done when:** Start with pantry add/delete on two devices for the same account. Specify household bootstrap, account isolation, guest import confirmation, merge/delete/conflict rules, retry and offline behavior. Then cover equipment, restrictions, plans and durable feedback/onboarding settings. Do not silently upload body metrics currently promised local-only; require a separate explicit opt-in design. Verify ownership/RLS with two users. Show pending, synced and failed states from data operations. Prevent account A data appearing under B.

### DE-03 — Start new pantries empty

- **Current:** Fresh pantry suggestions remain unchecked. Local guest/browser and store checks cover zero ownership, back navigation, existing selections, migration, and confirmed-scan preservation.
- **Evidence:** `app/(onboarding)/staples.tsx`; `src/store/kitchen.ts initializePantryStarter`.
- **Owner/model:** App engineer; GPT-6 Luna · medium.
- **Dependencies:** Coordinate store edits with DE-02.
- **Done when:** Fresh users have zero owned ingredients until they select items or confirm a scan. Suggested starter choices may remain unchecked. Revisiting onboarding preserves real selections and confirmed photos; migration must not erase existing pantry data.

### DE-04 — Preview missing ingredients before confirming a plan

- **Current:** Weekly proposals show missing ingredient names per meal and an aggregated read-only What to get preview. Browser preview did not save a proposal, change the pantry, or mark groceries purchased; gaps recompute from current pantry and replacements.
- **Evidence:** `app/(tabs)/plan.tsx PlanSummary`; `src/engine/plan-grocery-needs.ts`; `src/components/ui/RecipeCard.tsx`.
- **Owner/model:** Planning UI engineer; GPT-6 Sol · medium.
- **Dependencies:** DE-03 for trustworthy pantry; share gap calculation with DE-05.
- **Done when:** Expose missing ingredient names per proposed meal and an aggregated read-only gap preview before confirmation. Refresh after pantry edits and swaps. Opening a preview must not confirm the plan or add pantry items. Reuse existing plan-gap calculation.

### DE-05 — Choose a meal replacement manually

- **Current:** Swap opens a focused picker with eligible meals, gaps, details, explicit confirmation, cancel, and no-safe state. Latest constraints are revalidated. Local browser draft/confirmed replacements preserved the other slots and target date/time; physical reminder rescheduling remains open.
- **Evidence:** `app/(tabs)/plan.tsx swap`; `src/engine/plan-week.ts swapPlanMeal`.
- **Owner/model:** Planning UI/engine engineer; GPT-6 Sol · medium.
- **Dependencies:** DE-04 gap preview; DE-02 persistence contract.
- **Done when:** Open a small set of hard-safe alternatives for the selected date/slot, with meal details and gaps. User selects and confirms; cancellation leaves the plan unchanged. Other slots remain unchanged. Recalculate groceries and confirmed-plan reminders. Show an explicit no-safe-alternative state.

### DE-06 — Food-style breadth and catalog coverage

- **Current:** Ten options are shared by Now and Plan. The 2,278-recipe catalog was audited through the existing matcher; neither proposed Southeast Asian nor Middle Eastern option had supporting matches, so neither was added. Required Chinese/Japanese/Korean remain available with explained soft fallback despite zero strict matches. Counts are in the execution record.
- **Evidence:** `src/lib/cuisines.ts`; `src/engine/cuisine-preference.ts`.
- **Owner/model:** Catalog/product engineer; GPT-6 Luna · medium for audit; Sol if matcher changes.
- **Dependencies:** Use shared taxonomy with DE-09.
- **Done when:** Interpret 'short genre list' provisionally as a request for more broad styles, pending clarification. Measure BUNDLED_CATALOG coverage through the existing matcher before proposing additions. Preserve Chinese/Japanese/Korean choices, hard constraints and explained soft relaxation. Avoid duplicate labels and unsupported coverage claims.

### DE-07 — Editable dislikes and temporary skips

- **Current:** Never again persists; Not right now is session-only and legacy persisted skips are discarded deliberately. Settings offers individual restore. Browser reload, restore, and immediate undo checks passed; Now and Plan use the same feedback constraints.
- **Evidence:** `app/settings.tsx Hidden suggestions`; `app/(tabs)/index.tsx`; `src/store/kitchen.ts recordSkip/removeDislike`.
- **Owner/model:** Preference/UI engineer; GPT-6 Sol · medium.
- **Dependencies:** DE-02 durable-feedback contract.
- **Done when:** Offer Never again and Not right now. List individually restorable exclusions in Settings. Define temporary skip expiry explicitly (proposed: current app session); never turn a skip into a durable dislike. Test Now/Plan consistency, restart, undo and safe restore.

### DE-08 — Reviewed real meal photography

- **Current:** Two reviewed real meal photos (PBJ and grilled cheese) are bundled with exact recipe mappings, provenance, licenses, modifications, and hashes. Cards/details use approved mappings only; other recipes retain neutral/text fallback. Meal and ingredient registries are separate, including during catalog regeneration.
- **Evidence:** `src/data/food-image-credits.json`; `src/data/food-image-sources.ts`; `src/components/ui/RecipeImage.tsx`; `current RecipeCard and recipe route`.
- **Owner/model:** Catalog/assets engineer; GPT-6 Sol · medium.
- **Dependencies:** Source/license and recipe-match review before DE-09.
- **Done when:** Audit reusable dataset/asset permissions and record source, author, license, modifications and exact/generic meal mapping. Use accurately matched real photos; no invented match or AI-generated replacement. Keep neutral/text fallback where no suitable photo exists. Reuse the credits pipeline and bundle approved assets. Ingredient references stay separate from meal photos.

### DE-09 — Photo-led Now preferences and separate Plan preferences

- **Current:** Now offers a skippable reviewed-photo preference step through continuous onboarding and Settings. Only explicit positives persist and only break score ties inside readiness buckets. Plan has an independent optional weekly cuisine using the shared taxonomy. Save, neutral skip, reload, clear, and restriction filtering passed local browser checks.
- **Evidence:** `app/(tabs)/index.tsx`; `app/(tabs)/plan.tsx`; `RecommendationSections.tsx`; `docs/specs/2026-08-22-dual-meal-journeys-design.md`.
- **Owner/model:** Product/UI engineer; GPT-6 Sol · medium.
- **Dependencies:** DE-08 reviewed images; DE-06 taxonomy; DE-12 prompt integration.
- **Done when:** Retain the two destinations and shared hard-safe engine. Add a skippable photo-led food-preference step for Now; inventory defines Ready now/Missing a few/More to get. Keep week-specific choices in Plan. Persist only explicit positive photo choices; a skip is neutral. Treat visual preferences as progressive onboarding, not a third journey.

### DE-10 — Standard camera flip control

- **Current:** Web camera uses a labeled Flip camera control with rear preference and stale-stream protection. Local no-camera fallback/cancel passed. Multiple physical cameras, denial, rapid switching, and native system-picker acceptance remain unverified.
- **Evidence:** `src/components/CameraCapture.web.tsx`; `src/lib/webcam.ts`; `app/scan.tsx`.
- **Owner/model:** Capture UI engineer; GPT-6 Sol · medium.
- **Dependencies:** None.
- **Done when:** Prefer a rear camera when available and expose one labeled Flip camera control for supported alternatives. Handle one-camera devices and desktop webcams without promising front/back hardware. Release old tracks and ignore stale requests. Verify denial, switching, close/reopen and native platform behavior.

### DE-11 — Skeleton loading and purposeful motion

- **Current:** Shared static skeletons cover real auth/sync/scan waits; step transitions respect reduced motion. The artificial synchronous-planning delay was removed. Browser review also fixed startup deep-link loss and Space activation for photo/pantry/plan selection controls. Light/dark mobile-size layouts and keyboard behavior were checked; real screen-reader and 200% text acceptance remain open.
- **Evidence:** `app/loading.tsx`; `app/(tabs)/plan.tsx`; `src/components/ui/PrimaryButton.tsx`; `CameraCapture.web.tsx`.
- **Owner/model:** Shared UI engineer; GPT-6 Sol · medium; Luna for a defined component follow-up.
- **Dependencies:** DE-01/02 async states; coordinate with DE-09 screens.
- **Done when:** Use skeletons only for actual waits, reserve layout space, expose loading semantics and error recovery. Add restrained step/result/confirmation transitions with reduced-motion behavior. Do not fake delays for synchronous recommendations. Verify keyboard, screen reader, 200% text and light/dark layouts.

### DE-12 — Complete continuous onboarding; reuse goals and metrics

- **Current:** The existing chooser is wired to real screens and optional photo UI with one skippable prompt per session. Browser checks cover neutral skip, explicit completion, editing, goal/body units, and deletion. Body metrics remain optional and local.
- **Evidence:** `app/(onboarding)/goals.tsx`; `app/settings.tsx`; `src/engine/onboarding-prompt.ts`; `src/engine/portion-guidance.ts`.
- **Owner/model:** Preference/UI engineer; GPT-6 Sol · medium.
- **Dependencies:** DE-07 preference semantics; DE-02 account persistence contract. Build the scheduling shell independently; DE-09 plugs in photo UI afterward. Unavailable prompt UI must defer safely.
- **Done when:** Wire the existing priority policy: safety, week preference when relevant, photo taste, optional body profile, reminders. At most one skippable prompt per session; answer/skip behavior is distinct and preferences remain editable. Verify existing metrics/goals rather than rebuilding. Keep metrics optional and local; never weaken hard constraints or treat omitted goals as weight loss.

### DE-13 — Verify cooking reminders and decide web coverage

- **Current:** A reproduced partial-schedule failure now surfaces retry instead of false success. New plans no longer start in the past; existing slot dates remain stable. Scheduler and local-date/DST checks pass. Physical delivery remains open and web is unsupported; see the reminder verification record.
- **Evidence:** `app/reminders.tsx`; `src/lib/meal-prep-notifications.ts`; `meal-prep-notifications.web.ts`; `meal-prep-notification-scheduler.ts`.
- **Owner/model:** Mobile QA/app engineer; GPT-6 Luna · medium for audit; Sol for fixes.
- **Dependencies:** DE-05 rescheduling; use existing Safari acceptance task.
- **Done when:** Verify real-device delivery before cooking, lead time, denial, timezone/day changes, plan replacement and cancellation without duplicates. Document supported platforms. Evaluate web support separately after defining whether closed-app delivery is required; do not mark unsupported web as implemented.

### DE-14 — Calorie information and intake tracking

- **Current:** Audit found zero usable calorie values across 2,278 bundled recipes. The [nutrition/intake contract](specs/2026-10-10-nutrition-and-intake.md) defines serving units, unknowns, explicit consumption, editable logs, and partial daily totals as separate implementation slices. No calorie values, intake log, or daily-total UI was added.
- **Evidence:** `src/engine/types.ts energyKcalPerServing/nutritionConfidence`; `src/engine/portion-guidance.ts`; `recipe route`; `dual-journey design §8`.
- **Owner/model:** Product/data engineer; GPT-6 Astra · high for data contract; Sol for implementation slices.
- **Dependencies:** Nutrition coverage/source audit; DE-02 ownership; DE-12 existing body controls.
- **Done when:** Treat this request as new backlog scope, not completed nutrition tracking. First define trusted energy sources, serving units, unknown values and coverage. Then add informational recipe calories and an editable intake log with date/servings and daily totals. Never equate missing nutrition to zero. Keep automated medical targets, weight history and macro dashboard outside this task unless separately scoped.

### DE-15 — Stripe tiers and entitlements

- **Current:** The [billing worksheet](specs/2026-10-10-billing-worksheet.md) is ready for marketing. No prices, entitlements, payment integration, or charges were invented. Test-mode implementation awaits approved tier and platform details.
- **Evidence:** `No Stripe references in audited app/src/package manifest`.
- **Owner/model:** Marketing/product defines tiers; billing engineer implements; GPT-6 Sol · medium; Astra for payment/security review.
- **Dependencies:** DE-01/02 identity; approved price and entitlement matrix; platform scope.
- **Done when:** Collect tier names, prices, currency, limits, trial and cancellation rules; do not invent them. Decide web/native purchase scope using current platform policies. Then implement test-mode Checkout/portal and server-verified webhook entitlements with signature validation, duplicate/out-of-order event handling, cancellations and isolation. No production charges during implementation.


### DE-16 — Push the intended release to production

- **Current:** The [execution record](reports/2026-10-12-feedback-execution.md) inventories local outcomes, validation, and release gates. No release commit, push, or deployment was performed.
- **Evidence:** Local app/Python checks and browser evidence; read-only hosted migration and pantry policy inspection. Current uncommitted changes have no exact-commit CI or hosted smoke-test evidence.
- **Dependencies:** Isolate intended changes from the mixed worktree; complete database, identity/sync, hardware, and hosted configuration acceptance. Keep unapproved billing out of production.
- **Done when:** Follow the verified PR/production process after required checks pass, then record the deployed commit, deployment result, live origin, and focused smoke tests. Request approval before any destructive production data change; none is proposed here.

## Decisions and overlap control

- **Manual swap:** user confirmed choosing the replacement meal; DE-05 extends existing automatic swap.
- **Short genre list:** provisionally interpreted as more broad options; clarification is pending.
  The existing ten choices and real catalog coverage must be audited before additions.
- **Photo-based preference:** interpreted as choosing appealing meal photos; pantry-camera recognition
  remains a separate existing capability. DE-08 owns assets; DE-09 owns selection UI; DE-12 owns when prompts appear.
- **Account scope:** DE-01 owns authentication; DE-02 owns data synchronization. A valid session alone
  must not claim cloud saving. Account-backed pantry/profile/plans are planned; body metrics retain their local-only promise.
- **Plan overlap:** DE-04 owns gap preview, DE-05 owns replacement selection. Both reuse existing
  grocery calculations. DE-13 owns reminder verification, not a second scheduler.
- **Goals versus tracking:** existing goals/height/weight and portion guidance belong to DE-12 verification.
  DE-14 alone introduces calorie display and intake tracking; this supersedes the older blanket exclusion
  only as planned work. Macro tracking, weight history and clinical targets remain outside this scope.
- **Billing:** pricing and tier entitlements depend on marketing; no prices or launch commitments are assumed.
- **Shared-file edits:** sequence DE-01/02/03/07/12 around the kitchen store, and DE-04/05/09 around Plan.
  Implement one bounded slice at a time; this plan does not start autonomous agents or concurrent edits.

### Existing records to reuse

- [August testing prompts](plans/2026-08-28-app-testing-issue-prompts.md) remain historical acceptance records:
  prompts 4/6/7/12 map to DE-12/06/13/04-05. Do not reopen completed features wholesale.
- [September UX prompts](plans/2026-09-04-ux-production-fix-prompts.md) remain historical implementation context.
  DE-08 supersedes generated meal-art fallback direction for new imagery work.
- [Dual journey design](specs/2026-08-22-dual-meal-journeys-design.md) supplies reusable contracts for
  photo taste, body profile, onboarding, planning and reminders. Existing contracts are not new tasks.
- [Google OAuth design](specs/2026-08-12-google-oauth-android-web-design.md) is extended by DE-01/02.
- [Reminder design](specs/2026-08-13-meal-prep-notifications-design.md) is reused by DE-13.
- Notion's existing **Pass iPhone Safari web-beta acceptance** task owns browser/device acceptance;
  link DE-01/02/10/13 evidence there rather than opening another Safari QA task.
- Existing launch tasks keep their recorded status/dates. Past due dates require replanning and
  do not establish whether a release happened. No new release dates are assigned here.

## Prompts and token-efficient execution

Use **Sol medium** for most implementation. Use **Luna medium** for bounded edits and audits.
Use **Astra high** for ambiguous account-sync contracts, nutrition data design or a targeted
security review. These are starting recommendations, not measured cost guarantees.
[Official model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection)
provides the general tier guidance; choose the lightest setting that passes the task's acceptance checks.

Start a focused task per work item. Paste this shared instruction once, then one prompt below:

> Read AGENTS.md, docs/agentic/OPERATING_SYSTEM.md, docs/00_PRODUCT_DIRECTION.md and the selected
> DE item in docs/09_FEEDBACK_ROADMAP.md. Inspect the current diff and relevant code before changing it.
> Implement only that item's missing behavior; preserve existing features and unrelated work.
> Keep allergens, dietary needs and equipment strict. Use the existing contracts and components.
> Verify acceptance criteria with focused tests and relevant browser/device checks; run npm run check
> for implementation handoff and report any blocked checks accurately. Update the same DE item rather
> than creating another backlog. Return changed files, verification and remaining limitations concisely.

### Prompt DE-01 — GPT-6 Sol · medium; Astra if callback diagnosis remains unresolved

Implement DE-01: add a login screen with Google OAuth, email/password signup, login and reset, plus Continue as guest. Preserve existing local kitchens. Diagnose the reported Chrome/Safari difference with session and callback evidence; show identity separately from sync status. Verify returning sessions, cancellation, errors and both browsers. Do not implement pantry synchronization in this task.

### Prompt DE-02 — GPT-6 Astra · high for contract; GPT-6 Sol · medium for bounded implementation

For DE-02, first produce a bounded sync contract using the existing store, Supabase schema and query functions. Define guest import, household ownership, deletions/conflicts, retries and account switching. Then implement the pantry vertical slice and prove same-account two-device add/delete plus two-user isolation. Extend remaining non-sensitive kitchen data in separate slices. Keep body metrics local unless an explicit opt-in design is approved.

### Prompt DE-03 — GPT-6 Luna · medium

Implement DE-03: remove automatic ownership of starter ingredients. Fresh pantries start empty; suggestions remain unselected until confirmed. Preserve existing inventories and confirmed scans when revisiting setup or migrating saved data. Test fresh install, back navigation and scan confirmation.

### Prompt DE-04 — GPT-6 Sol · medium

Implement DE-04 in the weekly proposal: expose each meal's missing ingredient names and an aggregated What to get preview before confirmation. Reuse existing gap calculations and refresh after swaps or pantry edits. Viewing gaps must not save the proposal, mark groceries purchased or alter pantry state.

### Prompt DE-05 — GPT-6 Sol · medium

Implement DE-05: make Swap open a focused picker of eligible replacement meals. Let the user inspect gaps, choose and confirm for exactly one date/meal slot. Keep allergies, dietary needs and equipment strict; preserve other slots and cancel without mutation. Recalculate groceries and reminders, including no-safe-alternative handling.

### Prompt DE-06 — GPT-6 Luna · medium for audit; Sol if matcher changes

Handle DE-06: audit current food-style options and their real BUNDLED_CATALOG coverage using the shared matcher. Propose only useful broad additions, retaining Chinese, Japanese and Korean. Implement supported agreed options consistently in Now and Plan; explain soft fallback and preserve hard constraints. Do not expand labels without checking recipes.

### Prompt DE-07 — GPT-6 Sol · medium

Implement DE-07: separate Never again from Not right now, and add a Settings list with individual restore controls. Keep permanent exclusions durable and temporary skips session-scoped; migrate legacy skip data deliberately. Preserve immediate undo and consistent Now/Plan behavior. Test restart, expiry and restore.

### Prompt DE-08 — GPT-6 Sol · medium

Implement DE-08 as an asset audit then a bounded integration: find real meal photos with verified reuse rights and recipe relevance, reuse the existing credits pipeline, and record provenance per asset. Restore meal imagery only where the match is honest; use a neutral fallback otherwise. Do not substitute ingredient photos or generated artwork for finished meals.

### Prompt DE-09 — GPT-6 Sol · medium

Implement DE-09 using the existing Now and Plan destinations. Add a skippable photo-led preference step with reviewed images and explicit positive selections. Keep pantry readiness buckets in Now and week-specific preferences in Plan. Reuse shared constraints and avoid duplicating the recommendation engine or adding a third journey.

### Prompt DE-10 — GPT-6 Sol · medium

Implement DE-10: replace the web camera's device chips with a standard accessible Flip camera action, preferring rear capture when available. Handle one camera, multiple webcams, denied access and rapid switching safely. Release old streams and preserve capture/review. Verify native capture separately because it uses the system picker.

### Prompt DE-11 — GPT-6 Sol · medium; Luna for a defined component follow-up

Implement DE-11: add shared skeletons for real asynchronous loading and restrained transitions for step changes, results and confirmations. Preserve layout and accessibility, support reduced motion, and keep actions responsive. Do not add fake waits to the synchronous engine. Validate loading, error, retry and both themes.

### Prompt DE-12 — GPT-6 Sol · medium

Implement DE-12 by wiring the existing continuous-onboarding policy to real screens. Reuse goals, metric inputs and Settings controls. Show at most one relevant skippable prompt per session, record completion only when answered, and keep edits accessible later. Verify unit conversion, deletion, neutral skips and hard constraints; keep body metrics local.

### Prompt DE-13 — GPT-6 Luna · medium for audit; Sol for fixes

Handle DE-13 as verification first: test existing native cooking reminders for delivery, permission denial, lead time, timezone changes, swaps and cancellation. Fix demonstrated failures and record physical-device evidence. Document that web is unsupported; scope a separate web-delivery design before implementing browser reminders.

### Prompt DE-14 — GPT-6 Astra · high for data contract; Sol for implementation slices

Design DE-14 before coding: audit calorie coverage and provenance, then specify serving units, unknown values, an editable meal-intake log and daily totals. Reuse existing goals/metrics and distinguish estimated portion advice from consumed calories. Split implementation into nutrition display and logging slices; do not invent calorie values or clinical targets.

### Prompt DE-15 — GPT-6 Sol · medium; Astra for payment/security review

Prepare DE-15's tier/entitlement worksheet for marketing without inventing prices. Once filled in, implement Stripe in test mode with account-bound Checkout, customer portal and server-verified entitlements. Test webhook signatures, duplicate/out-of-order events, cancellation and user isolation. Verify current native-store purchase requirements before exposing native payments.


Read only the selected item's evidence files plus required project guidance. Avoid repeating the
full app audit or pasting the full backlog into each task. After an unsuccessful diagnosis, provide
Astra the failing test, observed behavior and focused diff instead of the entire conversation.
Do not run multiple agents on overlapping files merely to spend more tokens.
