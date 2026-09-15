> **Historical execution plan.** It records the implementation boundary agreed on August 22. Current product behavior and release scope are governed by `../../00_PRODUCT_DIRECTION.md` and `../../04_UIUX_SPEC.md`.

# DecisionEats Dual Meal Journeys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DecisionEats offer two explicit decisions—make a meal now or plan one seven-day week—while preserving hard safety constraints, private personal data, bounded results, and plan-only grocery needs.

**Architecture:** Plain-data contracts and deterministic policy stay outside React and I/O; `src/engine/` consumes bundled `Recipe[]` values and emits capped now decisions, one weekly proposal, grocery needs, and portion guidance. Supabase stores personal profile/signal/onboarding/weekly state behind `user_id` RLS, Zustand coordinates the device experience, and local notifications are scheduled only after confirmation. The repository has no Swift target or toolchain, so checked-in JSON fixtures and an iOS handoff document are the parity boundary for Harshal's separate SwiftUI implementation.

**Tech Stack:** Expo 57, React Native 0.86, React 19.2, TypeScript 6 strict, Zod 4, Zustand 5, TanStack Query 5, Supabase/Postgres RLS, Python 3.12+ with Pydantic/Ruff/mypy/pytest, USDA FoodData Central build-time inputs.

## Global Constraints

- Home is a chooser with exactly two primary journey actions; do not add a persistent navigation tab.
- A now decision surface exposes at most four answers total across `ready`, `missing_few`, `missing_some`, and `grocery_run`; empty buckets are absent.
- Equipment, allergen, and dietary constraints are never relaxed. Time and cuisine are the only visibly relaxable inputs.
- `src/engine/` stays pure: no React, no `src/lib/`, no I/O, no clock, no randomness.
- A weekly proposal contains exactly seven dated entries and uses a labeled `day_of_decision` entry when no safe concrete entry fits.
- Every concrete weekly entry carries one offset-bearing RFC 3339 `plannedMealTime`; reminder scheduling never reconstructs it from the date.
- Grocery needs are capped at 12 unique canonical ingredients, belong only to one weekly plan, and cascade away with that plan. They are not a reusable shopping list.
- Only bundled catalog recipes may be stored in a weekly plan. Spoonacular persistence is restricted by code to `id`, `title`, and `imageUrl`.
- Body profiles, taste signals, satiety records, onboarding progress, weekly plans, entries, grocery needs, and reminder preferences are personal `user_id` data. Roommates and anonymous sessions cannot read them.
- Keep only one current body profile per user. No weight history, trends, calorie dashboard, macro tracking, or medical advice.
- Energy-based portion guidance is eligible only at age 18 or older when not pregnant or breastfeeding and when recipe nutrition confidence is `high` or `medium`.
- Nutrition estimates use Mifflin–St Jeor, fixed activity factors, bounded goal adjustments, quarter-serving rounding, and the simple label `Start with … serving(s)`. The UI never displays calories.
- Energy-based servings equal target meal kcal divided by `recipe.energyKcalPerServing`; `baseServings` is build-time normalization metadata and is not used again at runtime.
- USDA credentials use `USDA_FDC_API_KEY` only in build-time tooling. Low-confidence or missing nutrition suppresses guidance without suppressing the recipe.
- Continuous onboarding shows at most one skippable prompt per app session. Skipping defers the same prompt to a future session and never records a negative taste signal.
- Taste and satiety records are append-only and receive only authenticated `SELECT`/`INSERT` policies and grants.
- Local reminder permission denial or scheduling failure never blocks weekly-plan confirmation. Replacing a confirmed plan cancels stale identifiers before scheduling valid replacements.
- No hardcoded colors or spacing; use `src/theme/tokens.ts`. Every interactive element includes accessibility role, label, hint, and state where applicable.
- No new runtime service, general shopping list, barcode scanning, voice feature, roommate sharing UI, or persistent Spoonacular ingredient/instruction data.

---

### Task 1: Freeze Governing Design and Acceptance Contract

**Governing contract:** `docs/specs/2026-08-22-dual-meal-journeys-design.md`

**Files:**
- Create: `docs/specs/2026-08-22-dual-meal-journeys-design.md`
- Modify: `docs/superpowers/plans/2026-08-22-dual-meal-journeys.md`

**Interfaces:**
- Consumes: the approved dual-journey brief and the Global Constraints above.
- Produces: authoritative ownership, schema, algorithm, copy, fallback, and acceptance decisions used by Tasks 2–9.

- [x] **Step 1: Write the governing design**

Document these exact decisions: weekly state is personal; plan needs cap at 12; durable weekly recipes are bundled-only; skipped photos are neutral; prompt skips last one session; reminder timing is `planned meal time - max(recipe duration, selected lead)`; reminder presets are `0 | 10 | 15 | 30 | 60`; low nutrition confidence suppresses only portion guidance; SwiftUI work consumes the JSON fixtures in a separate repository.

- [x] **Step 2: Freeze user-facing copy**

Record these meanings: `Make a meal now`, `Use your saved pantry, with an optional photo refresh.`; `Plan and prep my week`, `Get one seven-day plan and only what that plan needs.`; fallback `Decide that day`; nutrition disclaimer `Estimate only—adjust to your hunger.`; plan action `Use this plan`; grocery heading `What this plan needs`.

- [x] **Step 3: Self-review the design and plan**

Run:

```bash
rg -n 'T[B]D|T[O]DO|implement[ ]later|shopping[ ]list[ ]subsystem|household-owned[ ]weekly' \
  docs/specs/2026-08-22-dual-meal-journeys-design.md \
  docs/superpowers/plans/2026-08-22-dual-meal-journeys.md
```

Expected: no placeholders and no contradictory ownership or shopping-list language.

- [x] **Step 4: Commit**

```bash
git add docs/specs/2026-08-22-dual-meal-journeys-design.md \
  docs/superpowers/plans/2026-08-22-dual-meal-journeys.md
git commit -m "Freeze dual journey design"
```

---

### Task 2: Add Shared Schemas and Fail-Closed Boundaries

**Files:**
- Create: `src/contracts/meal-journeys.ts`
- Create: `src/contracts/meal-journeys.test.ts`
- Create: `shared/contracts/meal-journeys.schema.json`
- Create: `shared/fixtures/dual-meal-journeys.json`
- Create: `src/engine/visible-decision.ts`
- Create: `src/engine/visible-decision.test.ts`
- Create: `src/lib/spoonacular-persistence.ts`
- Create: `src/lib/spoonacular-persistence.test.ts`
- Modify: `src/engine/types.ts`
- Modify: `src/lib/adapters/to-recipe.ts`
- Modify: `src/lib/adapters/adapters.test.ts`
- Modify: `src/engine/bucket.ts`
- Modify: `src/engine/bucket.test.ts`

**Interfaces:**
- Consumes: existing `Recipe`, `DecisionResult`, `Relaxation`, and hard filters.
- Produces: `MealJourney`, `BodyGoal`, `ActivityLevel`, `CalculationSex`, `BodyProfile`, `TasteSignal`, `MealSatietyInput`, `MealSatietyRecord`, `PortionGuidance`, `WeeklyMealPlan`, `PlanLinkedGroceryNeed`, `ContinuousOnboardingProgress`, `ContinuousOnboardingPromptState`, `MealReminderPreferences`, `toVisibleDecision()`, and `toPersistableSpoonacularRecipe()`.

- [ ] **Step 1: Write failing runtime-schema tests**

Assert closed values, reject underage/invalid body fields, accept an ineligible pregnant or breastfeeding adult profile for safe fallback, parse satiety input/record fields, parse durable onboarding progress and session prompt state separately, accept only the five reminder leads, require an offset-bearing RFC 3339 `plannedMealTime` on concrete weekly entries, accept exactly seven weekly entries, reject more than 12 needs, and parse `shared/fixtures/dual-meal-journeys.json`.

- [ ] **Step 2: Verify schema tests fail**

Run: `npm test -- src/contracts/meal-journeys.test.ts`

Expected: FAIL because the schemas and fixture do not exist.

- [ ] **Step 3: Implement the contract**

Use these exact domains and bounds:

```ts
type MealJourney = 'now' | 'week';
type BodyGoal = 'lose' | 'maintain' | 'gain';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
type CalculationSex = 'female' | 'male';
type NutritionConfidence = 'high' | 'medium' | 'low' | 'unavailable';
type TasteSignalKind = 'photo_selected';
type MealSatietyLevel = 'still_hungry' | 'satisfied' | 'too_full';
type ContinuousOnboardingPromptKind = 'safety' | 'week_preference' | 'photo_taste' | 'body_profile' | 'reminder';
type WeeklyEntryKind = 'recipe' | 'day_of_decision';
type WeeklyPlanStatus = 'draft' | 'confirmed';
type ReminderLeadMinutes = 0 | 10 | 15 | 30 | 60;

interface MealSatietyInput {
  recipeId: string;
  level: MealSatietyLevel;
}

interface MealSatietyRecord extends MealSatietyInput {
  id: string;
  userId: string;
  recordedAt: string;
}

interface ContinuousOnboardingProgress {
  safetyCompleted: boolean;
  weekPreferenceCompleted: boolean;
  photoTasteCompleted: boolean;
  bodyProfileCompleted: boolean;
  reminderCompleted: boolean;
  updatedAt: string;
}

interface ContinuousOnboardingPromptState {
  shownThisSession: boolean;
  activePrompt: ContinuousOnboardingPromptKind | null;
}

interface MealReminderPreferences {
  enabled: boolean;
  leadMinutes: ReminderLeadMinutes;
  updatedAt: string;
}

interface RecipeWeeklyEntry {
  kind: 'recipe';
  date: string;
  recipeId: string;
  plannedMealTime: string;
  statedRelaxations: readonly ('time' | 'cuisine')[];
  portionGuidance: PortionGuidance | null;
}
```

`BodyProfile` requires age `18..120`, height `120..230` cm, weight `35..300` kg, calculation sex, activity, goal, and pregnancy/breastfeeding flags. `TasteSignal` records only a selected recipe ID, journey, and ISO timestamp. `MealSatietyInput` contains only recipe ID and level; its append-only record adds UUID `id`, authenticated `userId`, and server-generated ISO `recordedAt`. Onboarding progress is a mutable, durable one-row record; prompt state is session-only with the `false/null` → `true/kind` → `true/null` lifecycle. Reminder preferences are one mutable durable row, with `updatedAt` server-generated for both durable current-state contracts. `plannedMealTime` must be RFC 3339 with a numeric UTC offset and its local date must equal `date`. `WeeklyMealPlan` has one ISO week start, seven entries, status, grocery needs, and stated relaxations. Generate the checked-in JSON Schema with Zod 4's JSON-schema conversion and assert regeneration is stable.

- [ ] **Step 4: Write failing result-cap and equipment tests**

Assert `toVisibleDecision()` keeps bucket order, removes empty buckets, and exposes four total scored recipes even when every bucket contains four. Assert missing, empty, or unknown equipment metadata becomes `['unclassified']`, while an explicit `['none']` remains `['none']`.

- [ ] **Step 5: Verify boundary tests fail**

Run: `npm test -- src/engine/visible-decision.test.ts src/lib/adapters/adapters.test.ts`

Expected: FAIL because current output can surface 16 cards and the adapter maps unknown equipment to `none`.

- [ ] **Step 6: Implement fail-closed boundaries**

`toVisibleDecision(result, limit = 4)` consumes buckets in readiness order and returns only non-empty bucket arrays whose combined length is at most four. Rename the per-bucket constant so it cannot be mistaken for the decision-surface cap. Change the adapter fallback to `['unclassified']` without changing a verified explicit `none`.

- [ ] **Step 7: Enforce Spoonacular's persistence whitelist**

Write the failing test first, then implement:

```ts
interface PersistableSpoonacularRecipe {
  id: string;
  title: string;
  imageUrl: string | null;
}

function toPersistableSpoonacularRecipe(input: unknown): PersistableSpoonacularRecipe | null;
```

The test passes an object containing ingredients, instructions, time, equipment, servings, and nutrition, then asserts `Object.keys()` is exactly `['id', 'title', 'imageUrl']`.

- [ ] **Step 8: Verify and commit**

Run: `npm test -- src/contracts/meal-journeys.test.ts src/engine/visible-decision.test.ts src/lib/adapters/adapters.test.ts src/lib/spoonacular-persistence.test.ts`

```bash
git add src/contracts shared src/engine src/lib/adapters/to-recipe.ts \
  src/lib/adapters/adapters.test.ts src/lib/spoonacular-persistence.ts \
  src/lib/spoonacular-persistence.test.ts
git commit -m "Add meal journey contracts"
```

---

### Task 3: Implement Portion and Continuous-Onboarding Policy

**Files:**
- Create: `src/engine/portion-guidance.ts`
- Create: `src/engine/portion-guidance.test.ts`
- Create: `src/engine/onboarding-prompt.ts`
- Create: `src/engine/onboarding-prompt.test.ts`
- Modify: `src/engine/__fixtures__.ts`
- Modify: `src/engine/purity.test.ts`

**Interfaces:**
- Consumes: Task 2 contracts plus recipe nutrition fields.
- Produces: `getPortionGuidance(input): PortionGuidance | null` and `chooseContinuousOnboardingPrompt(input): ContinuousOnboardingPrompt | null`.

- [ ] **Step 1: Write failing portion tests**

Cover eligible lose/maintain/gain profiles, each activity level, age 17, pregnancy, breastfeeding, missing profile, `low`/`unavailable` nutrition, missing/non-positive/non-finite per-serving energy, target-meal-kcal conversion, independence from `baseServings`, quarter-serving rounding, lower/upper clamps, and satiety fallback. Assert output contains no calorie or macro field.

- [ ] **Step 2: Verify portion tests fail**

Run: `npm test -- src/engine/portion-guidance.test.ts`

- [ ] **Step 3: Implement exact portion policy**

Use Mifflin–St Jeor `restingKcal = 10*kg + 6.25*cm - 5*age + sexOffset`, with offsets `female=-161`, `male=5`; activity factors `1.2`, `1.375`, `1.55`, `1.725`, `1.9`; goal adjustments `lose=-250`, `maintain=0`, `gain=200` kcal/day; `targetMealKcal = (restingKcal * activityFactor + goalAdjustment) / 3`; and `energyBasedServings = targetMealKcal / recipe.energyKcalPerServing`. Then add satiety `still_hungry=+0.25`, `satisfied=0`, or `too_full=-0.25` servings, round to the nearest `0.25`, and clamp to `0.75..1.5`. `baseServings` is used only during build-time whole-recipe-to-per-serving energy normalization and never enters this runtime formula. When energy calculation is ineligible, use goal baselines `0.9`, `1.0`, `1.1` plus satiety, rounded/clamped the same way; an absent or invalid profile uses maintain `1.0`. Return `null` for `low`/`unavailable` confidence or missing, non-finite, or non-positive per-serving energy.

- [ ] **Step 4: Write failing prompt-priority tests**

Assert priority is safety, week-critical preference when journey is `week`, photo taste, body profile, reminder; `false/null` selects at most one prompt and becomes `true/kind`; `shownThisSession=true` never selects a second prompt; answer or skip produces `true/null`; skip leaves durable progress unchanged; and answer marks only that prompt complete.

- [ ] **Step 5: Verify prompt tests fail, implement, and verify green**

Run before and after: `npm test -- src/engine/onboarding-prompt.test.ts`

- [ ] **Step 6: Verify purity and commit**

Run: `npm test -- src/engine/portion-guidance.test.ts src/engine/onboarding-prompt.test.ts src/engine/purity.test.ts`

```bash
git add src/engine
git commit -m "Add portion and prompt policy"
```

---

### Task 4: Implement the Seven-Day Planner and Grocery Needs

**Files:**
- Create: `src/engine/plan-week.ts`
- Create: `src/engine/plan-week.test.ts`
- Create: `src/engine/plan-grocery-needs.ts`
- Create: `src/engine/plan-grocery-needs.test.ts`
- Modify: `src/engine/__fixtures__.ts`
- Modify: `src/engine/types.ts`

**Interfaces:**
- Consumes: bundled `Recipe[]`, pantry set, `UserPreferences`, seven dated daily preferences, positive taste signals, and Task 3 portion input.
- Produces: `planWeek(input): WeeklyMealPlan` and `derivePlanLinkedGroceryNeeds(entries, pantry, limit): PlanLinkedGroceryNeed[]`.

- [ ] **Step 1: Write failing grocery-need tests**

Assert canonical deduplication, stable ingredient ordering, recipe/date references, no pantry items, no more than 12 needs, and no unreported missing ingredient on any concrete entry.

- [ ] **Step 2: Verify grocery tests fail**

Run: `npm test -- src/engine/plan-grocery-needs.test.ts`

- [ ] **Step 3: Implement grocery derivation**

Union each concrete entry's missing canonical ingredient IDs; merge recipe IDs and dates; sort by ingredient ID; reject a candidate entry before selection when adding it would exceed the cap rather than silently truncating needs.

- [ ] **Step 4: Write failing planner tests**

Cover exactly seven entries, stable output, offset-bearing `plannedMealTime`, bundled-only recipe entries, hard-constraint decoys, selected-limit bounds of integer `1..120`, an off-tier selected limit, no duplicate time tier, only standard tiers strictly above the selected limit, a hard-safe recipe over 120 minutes falling back to `no_safe_recipe`, time/cuisine relaxations stated per entry, positive taste as a tie-breaker only, rotation before repetition, capped needs, no-safe-candidate fallback, low-confidence nutrition retaining the meal but omitting portion guidance, and a fixture snapshot matching `shared/fixtures/dual-meal-journeys.json`.

- [ ] **Step 5: Verify planner tests fail**

Run: `npm test -- src/engine/plan-week.test.ts`

- [ ] **Step 6: Implement deterministic planning**

For each of seven dates: hard-filter without ever changing equipment, allergen, or dietary constraints. Require integer `selectedLimit` in `1..120`, then build candidate time tiers as `[selectedLimit, ...[15, 30, 60, 120].filter(tier => tier > selectedLimit)]`; try exact cuisine at each tier, then drop cuisine and retry the same tiers. A greater tier states `time`; dropping cuisine states `cuisine`. Score by readiness, existing recipe score, selected-photo boost, unused recipe preference, then recipe ID. Accept a concrete entry only if its unique missing ingredients keep the plan at or below 12; otherwise emit `day_of_decision` with reason `grocery_need_cap`. If no hard-safe recipe fits any permitted tier—including a hard-safe recipe over 120 minutes—emit reason `no_safe_recipe`. Build each concrete entry's offset-bearing RFC 3339 `plannedMealTime` from the supplied date and daily meal-time preference. Never admit `source: 'tier2'`.

- [ ] **Step 7: Verify and commit**

Run: `npm test -- src/engine/plan-week.test.ts src/engine/plan-grocery-needs.test.ts src/engine/filter-hard.test.ts src/engine/purity.test.ts`

```bash
git add src/engine shared/fixtures/dual-meal-journeys.json
git commit -m "Add weekly planning engine"
```

---

### Task 5: Add Personal Supabase Persistence and RLS Proofs

**Files:**
- Create with CLI: `supabase/migrations/*_dual_meal_journeys.sql`
- Create: `supabase/tests/journey_schema_verification.sql`
- Modify: `supabase/tests/rls_verification.sql`
- Modify/generated: `src/types/supabase-generated.ts`
- Modify: `src/types/database.ts`
- Modify: `src/lib/queries/preferences.ts`
- Modify: `src/lib/queries/keys.ts`
- Create: `src/lib/meal-journey-persistence.ts`
- Create: `src/lib/meal-journey-persistence.test.ts`

**Interfaces:**
- Consumes: Task 2 contracts and authenticated user IDs.
- Produces: current body-profile CRUD, append-only photo taste and satiety inserts, onboarding progress upsert, one weekly plan whose derived entries/needs replace through delete-and-reinsert, parent-only confirmation update, and reminder preference persistence.

- [ ] **Step 1: Create the migration through the Supabase CLI**

Run: `npx supabase migration new dual_meal_journeys`

Do not invent a filename or modify existing migrations.

- [ ] **Step 2: Write failing RLS and structure assertions**

Extend A/A2/B/anon coverage before the schema. Add structural assertions for RLS enabled, personal `user_id` ownership, explicit per-table grants, composite child ownership FKs, indexes, absence of `household_id` on weekly tables, absence of authenticated `UPDATE`/`DELETE` policies and grants on append-only taste and satiety tables, and absence of authenticated `UPDATE` policies and grants on weekly entry and grocery-need children.

- [ ] **Step 3: Implement the schema**

Create `body_profiles` with `user_id` primary key; `taste_signals` and `meal_satiety` append-only; one-row `onboarding_progress`; `weekly_meal_plans`; `weekly_meal_plan_entries`; `plan_linked_grocery_needs`; and one-row `meal_reminder_preferences`. Child plan tables carry `user_id` and reference `(plan_id, user_id)` on the parent. Enable RLS in the same migration and create only these operation-specific authenticated policies and grants: `body_profiles` gets SELECT/INSERT/UPDATE/DELETE; `taste_signals` and `meal_satiety` get SELECT/INSERT only; `onboarding_progress` gets SELECT/INSERT/UPDATE; `weekly_meal_plans` gets SELECT/INSERT/UPDATE/DELETE; `weekly_meal_plan_entries` and `plan_linked_grocery_needs` get SELECT/INSERT/DELETE only; and `meal_reminder_preferences` gets SELECT/INSERT/UPDATE. Every predicate uses `(select auth.uid())`; UPDATE has both `using` and `with check`, INSERT has `with check`, and SELECT/DELETE have `using`. Entries and needs are immutable derived snapshots: plan creation inserts complete child sets, replanning/replacement deletes existing children and inserts the complete replacement sets in one operation boundary, and confirmation updates only the parent status. Account and parent cascades remain database behavior, not append-only client DELETE permission. Update legacy `inventory.source='shopping_list'` rows to `manual`, then recreate its CHECK without `shopping_list`.

- [ ] **Step 4: Verify RLS locally**

Run:

```bash
npx supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/rls_verification.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/journey_schema_verification.sql
```

Expected: every assertion reports `PASS` and both commands exit zero.

- [ ] **Step 5: Write failing persistence-mapper tests**

Assert only contract fields reach inserts, satiety input cannot carry generated ownership/record fields, append-only mappers expose no update/delete operation, body delete removes the current profile, child mappers expose no update operation, plan replacement deletes existing entry/need rows and inserts complete replacement sets in one operation boundary, confirmation updates only the parent status, only bundled recipe IDs enter durable entries, reminder/onboarding mappers accept only their mutable current-state fields, and Spoonacular extra content cannot cross the mapper.

- [ ] **Step 6: Implement queries and regenerate types**

Use the existing Supabase client/query-key patterns. Regenerate from the reset local schema rather than hand-writing generated rows:

```bash
npx supabase gen types typescript --local > /tmp/homechef-supabase-generated.ts
```

Replace `src/types/supabase-generated.ts` through the repository's normal generated-file workflow and narrow CHECK domains in `src/types/database.ts`.

- [ ] **Step 7: Verify and commit**

Run: `npm test -- src/lib/meal-journey-persistence.test.ts && npm run typecheck`

```bash
git add supabase src/types src/lib/queries src/lib/meal-journey-persistence.ts \
  src/lib/meal-journey-persistence.test.ts
git commit -m "Add private journey persistence"
```

---

### Task 6: Add Deterministic USDA Nutrition Enrichment

**Files:**
- Create: `tools/catalog/nutrition.py`
- Create: `tools/catalog/tests/test_nutrition.py`
- Create: `tools/catalog/tests/fixtures/usda_foods.json`
- Modify: `tools/catalog/models.py`
- Modify: `tools/catalog/build.py`
- Modify: `tools/catalog/seed_loader.py`
- Modify: `tools/catalog/__main__.py`
- Modify: `tools/catalog/tests/test_build.py`
- Modify: `tools/catalog/tests/test_seed.py`
- Modify: `src/lib/adapters/to-recipe.ts`
- Modify: `src/data/catalog.test.ts`
- Modify/generated: `src/data/recipes.json`

**Interfaces:**
- Consumes: owned bundled catalog ingredients and a checksum-pinned USDA cache fetched with `USDA_FDC_API_KEY` only when explicitly requested.
- Produces: recipe `baseServings`, `energyKcalPerServing`, `nutritionProvenance`, and `nutritionConfidence` values with safe null/unavailable defaults.

- [ ] **Step 1: Write failing typed-enrichment tests**

Cover exact and alias matches, unmatched items, confidence `0..1`, low-confidence null energy, provenance completeness, checksum mismatch, stable serialization, and rejection of any `source != 'tier1'` input.

- [ ] **Step 2: Verify tests fail**

Run: `python3 -m pytest tools/catalog/tests/test_nutrition.py -q`

- [ ] **Step 3: Implement cache-first enrichment**

The default catalog build performs no network access. `--usda-cache PATH` reads a committed-format cache after verifying its SHA-256; `--refresh-usda-cache PATH` requires `USDA_FDC_API_KEY`, calls Food Search/Details at build time, and writes the cache. Store USDA FDC IDs, cache checksum, match method, source version, calculated timestamp from the cache metadata, and confidence. Never process Spoonacular-shaped recipes.

- [ ] **Step 4: Extend the catalog and adapter safely**

Unknown base servings and energy remain `null`; confidence is `unavailable`. Hand-curated single-meal seeds use `baseServings: 1`. Only `high` and `medium` estimates are eligible for Task 3 guidance. Mechanically regenerate `recipes.json` so every record contains the new keys without changing recipe identity, instructions, source, or safety metadata.

- [ ] **Step 5: Verify Python and catalog contracts**

Run:

```bash
python3 -m ruff check tools
python3 -m mypy tools
python3 -m pytest -q
npm test -- src/data/catalog.test.ts src/lib/adapters/adapters.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add tools/catalog src/data/recipes.json src/data/catalog.test.ts \
  src/lib/adapters/to-recipe.ts src/lib/adapters/adapters.test.ts
git commit -m "Add USDA nutrition enrichment"
```

---

### Task 7: Integrate Confirmed-Plan Reminders and Client State

**Files:**
- Create: `src/lib/meal-prep-reminder.ts`
- Create: `src/lib/meal-prep-reminder.test.ts`
- Create: `src/lib/meal-prep-notification-scheduler.ts`
- Create: `src/lib/meal-prep-notification-scheduler.test.ts`
- Create: `src/lib/meal-prep-notifications.ts`
- Create: `src/lib/meal-prep-notifications.web.ts`
- Create: `src/lib/weekly-plan-coordinator.ts`
- Create: `src/lib/weekly-plan-coordinator.test.ts`
- Modify: `src/store/kitchen.ts`
- Modify: `src/store/kitchen.test.ts`
- Modify: `app/settings.tsx`
- Modify: `app/_layout.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`

**Interfaces:**
- Consumes: Task 4 weekly plan and Task 5 reminder preference contract.
- Produces: persisted local draft/confirmed plan mirror, transient prompt-session state, notification configuration, and `confirmWeeklyPlan(plan, dependencies)`.

- [ ] **Step 1: Write a failing integration test**

Assert confirmation saves before scheduling, only recipe entries from a confirmed plan schedule, denied permission still returns confirmed state, scheduler errors are contained, replacement clears stale identifiers, disable clears identifiers, and an unconfirmed draft never schedules.

- [ ] **Step 2: Verify integration test fails**

Run: `npm test -- src/lib/weekly-plan-coordinator.test.ts`

- [ ] **Step 3: Port the approved notification foundation**

Transplant the focused implementation from `ef895b7` without overwriting current PostHog, photo-auth, layout, settings, or dependency changes. Preserve reminder presets `0 | 10 | 15 | 30 | 60` and `plannedMealTime - max(totalTimeMinutes, leadMinutes)`. Parse the concrete entry's offset-bearing RFC 3339 `plannedMealTime` at the notification boundary; never reconstruct meal time from `date`. Ensure disabled sync cancels saved identifiers. Web remains a no-op.

- [ ] **Step 4: Extend store behavior test-first**

Add one weekly preference object, one draft, one confirmed plan, positive photo taste IDs, onboarding progress, and reminder preferences. Do not persist the per-session `shown` flag; keep it in a root React provider so an app restart creates a new session. Reset clears plan state and calls coordinator cleanup through the UI boundary.

- [ ] **Step 5: Implement confirmation and resync**

Persist confirmed state first, then best-effort sync concrete entries. Root layout configures notifications and resyncs the confirmed plan after hydration. A changed timezone or replaced plan runs the same replacement sync; concurrent sync requests serialize so an older request cannot cancel newer identifiers.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- src/lib/meal-prep-reminder.test.ts src/lib/meal-prep-notification-scheduler.test.ts src/lib/weekly-plan-coordinator.test.ts src/store/kitchen.test.ts`

```bash
git add app.json package.json package-lock.json app/_layout.tsx app/settings.tsx \
  src/lib/meal-prep-* src/lib/weekly-plan-coordinator* src/store
git commit -m "Add confirmed plan reminders"
```

---

### Task 8: Build the Expo Dual-Journey Experience

**Files:**
- Create: `app/now.tsx`
- Create: `app/week.tsx`
- Create: `src/components/ui/JourneyCard.tsx`
- Create: `src/components/ui/ContinuousOnboardingPrompt.tsx`
- Create: `src/components/ui/WeeklyPlanEntryCard.tsx`
- Create: `src/components/journey-presenters.test.ts`
- Create: `src/lib/weekly-dates.ts`
- Create: `src/lib/weekly-dates.test.ts`
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/scan.tsx`
- Modify: `src/components/ui/BucketSection.tsx`
- Modify: `src/components/ui/RecipeCard.tsx`
- Modify: `src/theme/tokens.ts` only if a reusable semantic token is missing

**Interfaces:**
- Consumes: Task 2 visible decisions/contracts, Task 3 prompt/portion policy, Task 4 planner, Task 7 state/coordinator, existing scan flow and UI tokens.
- Produces: two Home entry actions, saved-pantry/photo-refresh now flow, one weekly proposal with plan needs and confirmation, and one accessible continuous prompt per session.

- [ ] **Step 1: Write failing presenter/accessibility tests**

Assert exactly two Home journey labels, at most four now answers, no empty bucket heading, all weekly entries have combined date/meal/duration/status labels, the grocery heading is plan-scoped, photo prompt records selected cards only, and every interactive presenter declares role/label/hint/state.

- [ ] **Step 2: Verify UI tests fail**

Run: `npm test -- src/components/journey-presenters.test.ts`

- [ ] **Step 3: Build the Home chooser**

Use the existing warm counter palette and type scale. The signature is two large, unequal decision cards: the immediate action occupies the first visual beat; the seven-day action uses a quiet seven-dot rhythm marker. Copy is frozen in Task 1. Keep the existing Cook/Pantry tab structure but add no third tab; both journeys are stack routes.

- [ ] **Step 4: Move the current decision flow into `app/now.tsx`**

Start from saved pantry count; offer `Refresh pantry with photos` as optional drift correction; then time and optional cuisine; render `toVisibleDecision(decideWithRelaxation(...))`; hide empty buckets; route cards to recipe detail. Navigating to `/scan` and back preserves the mounted draft, and photo failure never mutates pantry.

- [ ] **Step 5: Build the weekly flow in `app/week.tsx`**

Collect one time limit, dinner-time preset, optional cuisine, and diner count; combine each supplied date and dinner-time preset into the concrete entry's offset-bearing RFC 3339 `plannedMealTime`; generate one seven-entry proposal; show all dated entries; show `What this plan needs` with at most 12 canonical needs; then `Use this plan`. Confirmation calls Task 7 and succeeds even when reminders do not. `day_of_decision` entries say `Decide that day` and never schedule.

- [ ] **Step 6: Add continuous onboarding presentation**

Use Task 3 priority and the root session provider. Safety routes to restrictions, week preference completes from the weekly inputs, taste shows three bundled recipe photos and stores only tapped recipes, body profile is private and optional, reminder uses the existing permission flow. Skip consumes the session slot but leaves durable progress unchanged.

- [ ] **Step 7: Verify web build and commit**

Run:

```bash
npm test -- src/components/journey-presenters.test.ts src/lib/weekly-dates.test.ts
npm run typecheck
npm run web:build
```

```bash
git add app src/components src/lib/weekly-dates* src/theme/tokens.ts
git commit -m "Build dual meal journeys"
```

---

### Task 9: Reconcile Documentation and Prepare SwiftUI Handoff

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/01_TECHNICAL_SPEC.md`
- Modify: `docs/03_COLLABORATION_BLUEPRINT.md`
- Modify: `docs/04_UIUX_SPEC.md`
- Modify: `docs/agentic/AI_TOOLING_PLAYBOOK.md`
- Modify: `docs/06_API_KEYS_AND_ENV.md`
- Modify: `docs/specs/2026-08-13-weekly-meal-prep-design.md`
- Modify: `docs/specs/2026-08-13-meal-prep-notifications-design.md`
- Modify: `docs/specs/2026-08-13-meal-satiety-design.md`
- Create: `docs/ios/dual-meal-journeys-handoff.md`

**Interfaces:**
- Consumes: implemented schemas, fixtures, migrations, algorithms, copy, and test evidence.
- Produces: one coherent active specification, USDA environment instructions, CLI/subagent prompt packet, and exact SwiftUI parity handoff.

- [ ] **Step 1: Reconcile active product and technical docs**

Replace stale countdowns, future launch promises, old go/no-go gates, voice-at-launch claims, household weekly ownership, grocery forecasting/history, and general shopping-list language. Preserve historical dates only inside clearly historical records. Use `pantry`, `catalog`, `bucket`, `equipment tier`, `household`, and `drift` exactly.

- [ ] **Step 2: Document nutrition and privacy operations**

Document `USDA_FDC_API_KEY` as build-time only, cache checksum/provenance, confidence suppression, current-profile deletion, no history, adult/pregnancy/breastfeeding eligibility, estimate disclaimer, and mandatory nutrition/privacy review before release.

- [ ] **Step 3: Document execution strategy and Swift parity**

Add official OpenAI model guidance: Sol owns contracts/security/nutrition/parity, Terra owns platform coordination, Luna owns bounded mechanical work. The iOS handoff names every contract field, fixture, copy meaning, reminder rule, safety invariant, and parity command without claiming Swift implementation exists in this repository.

- [ ] **Step 4: Scan for contradictions**

Run:

```bash
rg -n '21 days|days out|Launching August|Hard launch|Go/No-Go|shopping_list|shopping list|voice is tap-to-listen|household-owned[ ]weekly' \
  AGENTS.md README.md docs
rg -n 'gemini-2\.0-flash|gemini-flash-latest' AGENTS.md README.md docs src supabase tools
```

Review every match; active normative docs have no stale rule, while historical text is labeled.

- [ ] **Step 5: Verify formatting and commit**

Run: `npx prettier --check AGENTS.md README.md docs shared`

```bash
git add AGENTS.md README.md docs shared
git commit -m "Align dual journey documentation"
```

---

## Final Verification

Run fresh on the final tree:

```bash
npm run check
npm run web:build
python3 -m ruff check tools
python3 -m mypy tools
python3 -m pytest -q
npx supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/rls_verification.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/journey_schema_verification.sql
git diff --check
```

The release remains blocked until the same fixture file passes in Harshal's Swift target, Android notification/device behavior and timezone changes pass on physical hardware, and nutrition/privacy review approves the estimate policy.
