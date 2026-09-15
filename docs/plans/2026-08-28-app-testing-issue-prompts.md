# App Testing Follow-Up Prompts

**Date:** August 28, 2026  
**Purpose:** Historical acceptance records for issues found during hands-on testing
**Status:** Implementation complete as of August 30, 2026

These prompts are retained as the original problem statements, not as an active backlog. The
repository quality gate is the source of truth for automated verification. Physical-device
notification permission and browser zoom checks remain release validation activities rather than
open implementation defects.

| Prompt | Status | Implemented outcome |
| --- | --- | --- |
| 4 | Complete | Goal onboarding, optional local metrics, goal-aware ranking, metric-aware portion estimates, and Settings controls |
| 5 | Complete | One shared accessible Settings action |
| 6 | Complete | Reachable responsive cuisine filters without clipped desktop options |
| 7 | Complete | Dedicated reminder onboarding, configuration, schedule review, and honest web fallback |
| 9 | Complete | Curated microwave catalog, provenance, safety validation, and microwave-only recommendation coverage |
| 10 | Complete | Universal appliance choices and copy |
| 11 | Complete | Non-destructive Kitchen Setup management |
| 12 | Complete | Weekly Plan reversal journey, grocery updates, confirmed-plan reminders, and preference-correct regeneration |

The August 30 production-spec audit also closed five regressions that were not represented as
standalone prompts:

- Recommendation results use the product taxonomy: **Ready now**, **Missing a few**, and
  **More to get**.
- Results initially show four matches and reveal additional matches in four-item batches.
- Primary navigation is **Now**, **Plan**, **Pantry**; dedicated cook mode is retired, with saved
  cook links redirecting to recipe instructions.
- Confirmed Plan selections are kept as bounded, local positive preference signals and influence
  future proposals only as a tie-breaker.
- Plan generation honors the just-selected variety and explains preparation style and ingredient
  reuse before confirmation.

The original acceptance prompts follow.

## Prompt 4: Add caloric goals and weight gain/loss onboarding page before pantry staples

```text
Design and implement a caloric goals and weight gain/loss onboarding step positioned immediately
before the “We assumed you have these” pantry starter screen in DecisionEats.

Before coding, read docs/agentic/OPERATING_SYSTEM.md, docs/00_PRODUCT_DIRECTION.md,
docs/04_UIUX_SPEC.md, and the supporting body-profile, portion-guidance, privacy, and
continuous-onboarding contracts in docs/specs/2026-08-22-dual-meal-journeys-design.md. Inspect the
current onboarding navigation flow in app/(onboarding)/.

Current problem:
1. Onboarding jumps directly from equipment and allergies/diet to the pre-populated pantry staples
   screen without understanding user meal intentions or caloric goals.
2. Users have no way to indicate if they want to lose weight, gain weight, or maintain their weight.
3. When goals are unspecified or weight loss is targeted, the engine does not prioritize lower-calorie,
   lighter meals.

Required behavior:
- Onboarding Placement & Sequence:
  - Add a dedicated goals onboarding screen (app/(onboarding)/goals.tsx) as Step 3 of 4:
    1. Kitchen Equipment (`/equipment`)
    2. Allergies & Dietary Restrictions (`/restrictions`)
    3. Goals & Caloric Preferences (`/goals`)
    4. Pantry Starter (`/staples` — “We assumed you have these”)
- Experience & Goal Input:
  - Ask for the primary goal in one clear, focused screen: Lose weight, Maintain weight, Gain weight,
    or a neutral Skip (“Not now / Skip”).
  - Provide progressive disclosure for optional body metrics: current weight and height (with unit
    toggles for kg/lbs and cm/ft-in).
  - Explicitly explain why height/weight is asked (“Used only to personalize portion estimates on this
    device”) and make it 100% optional.
- Decision Engine & Recommendation Impact:
  - When “Lose weight” is selected (or when caloric deficit is computed from optional profile data,
    or as the fallback when unspecified), adjust recommendation ranking weights to prioritize
    lower-calorie-density, lighter meal options.
  - When “Gain weight” is selected, prioritize nutrient-dense, higher-calorie options.
  - When “Maintain weight” or skipped, use standard balanced ranking.
  - Display helpful portion guidance on recipes with nutrition confidence: “Start with … serving(s)”
    and “Estimate only—adjust to your hunger.”
  - Caloric goals and portion guidance may influence ranking and suggested servings, but MUST NEVER
    compromise hard constraints (allergens, dietary restrictions, equipment).
- Privacy & Settings Management:
  - Store goal data locally. Never transmit health/body metrics to analytics or third parties.
  - Allow users to edit their goal, update height/weight, or permanently clear body data at any time
    from Settings.

Tests must verify the onboarding navigation order (Equipment -> Restrictions -> Goals -> Staples),
skip handling, optional metric input validation and conversion, goal persistence in kitchen store,
caloric ranking adjustments, portion estimate calculation, and accessibility labels. Complete
implementation and tests, run focused tests and npm run check, and review the final diff.
```

## Prompt 5: Polish the Settings action

```text
Polish DecisionEats's Settings action across every screen where it appears.

Read docs/agentic/OPERATING_SYSTEM.md, docs/00_PRODUCT_DIRECTION.md,
docs/04_UIUX_SPEC.md, the theme tokens, shared button/icon primitives, and all current Settings
entry points. Inspect the existing diff before editing.

Current problem: the “⚙️ Settings” control relies on an emoji glyph and caption styling, so its
font, alignment, and rendering vary by platform and look unfinished.

Required behavior:
- Replace the emoji-based label with one shared, intentional Settings action.
- Reuse an icon system already installed in the project; do not add a dependency only for this
  control. If no approved icon exists, use a polished text-only action.
- Apply the same component, sizing, spacing, color, hover/pressed/focus states, and typography
  on Now, results, Pantry, Plan, and other current entry points.
- Keep Settings secondary to the main decision on every screen.
- Maintain at least a 44×44 touch target and an accessible “Settings” name and useful hint.
- The control must align cleanly at mobile and desktop widths, support light/dark themes and
  Dynamic Type, and never clip or rely on a platform emoji font.

Remove duplicated screen-level Settings button styles when the shared component replaces them.
Do not redesign the Settings page or primary navigation as part of this task. Add component and
screen tests for rendering, navigation, accessibility, theme states, and responsive placement.

Complete the implementation, run focused tests and visual checks at representative phone and
desktop widths, then run npm run check and review the final diff.
```

## Prompt 6: Make desktop cuisine filters fully reachable

```text
Fix the cuisine/genre filter row being clipped on desktop so every option is visible or
reachable.

Before editing, read docs/agentic/OPERATING_SYSTEM.md, docs/00_PRODUCT_DIRECTION.md,
docs/04_UIUX_SPEC.md, docs/specs/2026-08-12-responsive-web-layout-design.md, and the current
responsive shell, Now screen, Chip, and filter-row implementations. Inspect the current diff.

Reproduce the bug at the actual desktop breakpoints and identify which container owns the
overflow. Check at minimum 960px, 1180px, and a wide desktop viewport, plus browser zoom and
increased text size. Do not solve the problem by shrinking labels or touch targets.

Required behavior:
- Every cuisine option, including the last option, is visible or reachable on desktop.
- Prefer a wrapped desktop layout when it remains easy to scan; otherwise provide a clearly
  scrollable horizontal rail with working mouse wheel/trackpad, keyboard, and touch behavior.
- Mobile may retain its horizontal chip rail if that is still the best phone interaction.
- No option is hidden behind a clipped parent, and the page must not gain accidental horizontal
  document overflow.
- Keyboard users can tab to every chip and always see the focused control.
- Selected state, “Any” behavior, accessibility labels, and recommendation logic remain
  unchanged.

Add a regression test that verifies the responsive layout contract and, where supported, a
browser test that reaches and activates the last option at desktop width. Verify light/dark
themes, 200% text scaling, reduced motion, and narrow mobile layout.

Complete the fix and tests, run the focused responsive/browser checks and npm run check, then
review the final diff.
```

## Prompt 7: Create a meal-prep reminders page with its own onboarding

```text
Create a dedicated meal-prep and cooking-reminders experience for DecisionEats, including a short
first-visit onboarding flow.

Treat this as a product-scope addition. Read docs/agentic/OPERATING_SYSTEM.md,
docs/00_PRODUCT_DIRECTION.md, docs/04_UIUX_SPEC.md,
docs/specs/2026-08-13-meal-prep-notifications-design.md, and the current weekly-plan,
notification, settings, store, and routing code. Inspect the current diff. Update the current
product/UI docs before implementation so they distinguish this approved secondary destination
from primary Now, Plan, and Pantry navigation.

Current problem: reminder infrastructure and a Settings toggle may exist, but users do not have
a dedicated place to understand, configure, and review meal-prep reminders. There is no guided
first-use experience.

Required experience:
- Add a secondary Reminders page reachable from Settings and the confirmed Plan experience; do
  not add a fourth primary tab.
- On first visit, explain in one short screen that reminders are created only for concrete meals
  in a confirmed plan. Then ask for notification permission and reminder timing as focused,
  progressive steps. Permission denial must not block planning.
- After onboarding, show reminder status, the selected lead-time preset, and upcoming scheduled
  cooking reminders in chronological order.
- Allow reminders to be enabled/disabled, timing to be changed, onboarding guidance to be
  revisited, and platform settings to be opened after a denial where supported.
- Use only the approved lead presets: 0, 10, 15, 30, and 60 minutes.
- Schedule at planned meal time minus the greater of recipe duration and selected lead time.
- Draft plans, “Decide that day” entries, and one-off Now recommendations never schedule.
- Replacing or deleting a confirmed plan clears stale reminders before syncing replacements.
- Web provides an honest unsupported/no-op state and never pretends reminders were scheduled.

Reuse the existing notification boundary and persisted preference if present. Do not create a
remote push service, cron job, Edge Function, general calendar, or dedicated cook mode. Avoid
displaying dietary, allergy, pantry, or health information in notification content.

Tests must cover first-visit onboarding, repeat visits, permission grant/denial, every lead
preset, confirmed-plan-only scheduling, chronological display, stale cancellation, timezone
handling, web fallback, settings/plan navigation, and accessibility. Complete documentation,
implementation, and tests. Run focused checks, physical-device verification where available,
and npm run check; clearly report any device-only verification still required.
```

## Prompt 9: Curate authentic microwave meals and improve microwave recommendations

```text
Expand DecisionEats's microwave catalog with authentic, realistic microwave meals (e.g., microwave pizza,
microwave burritos, microwave quesadillas, mug meals) and ensure microwave-only users receive genuine,
practical meal recommendations.

Before editing, read docs/agentic/OPERATING_SYSTEM.md, docs/00_PRODUCT_DIRECTION.md,
docs/specs/2026-08-06-microwave-seed-catalog-design.md, and docs/specs/2026-08-22-owned-recipe-catalog-design.md.
Inspect the current catalog tools/catalog/seed/microwave.json, src/data/recipes.json, and the
equipment filtering engine in src/engine/filter-hard.ts.

Current problem:
Users selecting the “Microwave only” equipment tier report that recommendations are poor and lack
practical, authentic microwave meals that people actually make or assemble in microwaves (such as
microwave pizza / tortilla pizza, microwave bean and cheese burritos, breakfast burritos, microwave
quesadillas, mug mac & cheese, loaded baked potatoes).

Required behavior:
- Seed & Catalog Expansion:
  - Curate and add genuine microwave recipes into the owned microwave seed (tools/catalog/seed/microwave.json)
    and catalog bundle, including:
    - Microwave Personal Pizza (pita / english muffin / tortilla base, marinara, cheese, toppings)
    - Microwave Bean & Cheese Burrito (tortilla, refried beans, cheddar/jack cheese, salsa)
    - Microwave Breakfast Burrito (scrambled mug egg, tortilla, cheese, optional salsa)
    - Microwave Cheese Quesadilla (tortilla, cheese, salsa)
    - Microwave Mug Mac & Cheese (pasta, water, milk/butter, shredded cheese)
    - Microwave Loaded Baked Potato (russet potato, butter, cheddar cheese, salt/pepper)
    - Microwave Steamed Rice & Veggie Bowl (pre-cooked or instant rice, frozen mixed veggies, soy sauce)
  - Every recipe must explicitly tag `equipmentRequired: ["microwave"]` and have accurate total time
    (typically 3–10 minutes).
- Safety & Culinary Standards:
  - Ground all recipes in USDA FSIS safety rules: no raw poultry, no eggs in shell (eggs must state
    "beat, or prick the yolk"), explicit standing time when carryover heating is required.
- Engine & Recommendation Matching:
  - When a microwave-only user has common pantry items (e.g., tortillas, cheese, beans, marinara,
    potatoes, bread/pita), the engine must reliably surface these authentic microwave meals in the
    “You have it all” or “Missing 1 ingredient” buckets.
  - Hard constraint verification: ensure non-microwave recipes are never served to microwave-only users.

Tests & Verification:
- Add tests in catalog validation and engine test suites proving that a microwave-only kitchen with
  standard staples returns these new microwave recipes in the ready bucket.
- Verify FSIS safety checks (no raw poultry, no shell eggs).
- Complete code and tests, run npm run check, and review the final diff.
```

## Prompt 10: Unify appliance options and make onboarding subtext universal

```text
Update DecisionEats's kitchen setup onboarding and settings to present appliances cleanly as first-class
appliance options (eliminating ambiguous “Anything else?” phrasing) and use universal, functional subtext.

Before editing, read docs/agentic/OPERATING_SYSTEM.md, docs/00_PRODUCT_DIRECTION.md,
docs/04_UIUX_SPEC.md, src/store/kitchen.ts, and app/(onboarding)/equipment.tsx. Inspect the current diff.

Current problem:
1. Subtitles under equipment tiers rely on colloquial or stereotypical phrasing (for example,
   “Microwave only” is described as “Dorm room basics”, and “Microwave + kettle” as “A little more range”).
   This framing feels narrow and out of place for adult users, office kitchens, or temporary living spaces.
2. The extra equipment section is vaguely titled “Anything else?”, relegating air fryer, rice cooker,
   blender, and toaster oven to an ambiguous catch-all rather than presenting them clearly as
   standard kitchen appliance options.

Required behavior:
- Unified Appliance Options:
  - Replace the vague “Anything else?” heading with a clear, direct section title (e.g., “Appliances”
    or “Kitchen appliances”).
  - Present all appliance choices (air fryer, rice cooker, blender, toaster oven, etc.) as clear,
    first-class appliance options that users can easily multi-select.
  - Ensure visual hierarchy and grouping make it immediately obvious that these appliances expand the
    range of cookable meals alongside the base equipment tier.
- Universal Subtext & Clean Framing:
  - Replace informal/stereotyped subtitles in `EQUIPMENT_TIERS` (src/store/kitchen.ts) with universal,
    descriptive, and functional copy:
    - Microwave only: “Cook using only a microwave” (or “For kitchens with only a microwave”)
    - Microwave + kettle: “Microwave plus electric kettle or boiling water”
    - Full kitchen: “Stove, oven, and standard cookware”
- Consistency Across Surfaces:
  - Apply the same clear appliance options framing and universal copy across onboarding
    (app/(onboarding)/equipment.tsx), Settings (app/settings.tsx), and the dedicated Kitchen Setup view.
  - Review helper copy across allergens, dietary presets, and goals for professional, universal tone.

Tests & Verification:
- Update and run unit/screen tests for `EQUIPMENT_TIERS` rendering, appliance chip/card selection,
  onboarding accessibility labels, and screen snapshots.
- Verify that accessibility names and hints remain accurate and descriptive for screen reader users.
- Run npm run check and review the final diff.
```

## Prompt 11: Add a dedicated, non-destructive Kitchen Setup management UI

```text
Create a dedicated, non-destructive “Kitchen Setup” management screen in DecisionEats that allows users to
reconfigure their equipment, appliances, and kitchen choices anytime without wiping out their pantry or
preferences.

Before editing, read docs/agentic/OPERATING_SYSTEM.md, docs/00_PRODUCT_DIRECTION.md,
docs/04_UIUX_SPEC.md, app/settings.tsx, app/(onboarding)/equipment.tsx, and src/store/kitchen.ts.

Current problem:
Users who need to update what appliances or equipment tier they have currently have to either scroll
through general Settings or use the destructive “Reset all data and onboarding” button, which wipes
out their entire pantry inventory and preferences. There is no dedicated, seamless way to simply
re-decide what is in the user's kitchen.

Required behavior:
- Dedicated Kitchen Setup Destination:
  - Provide a dedicated, accessible Kitchen Setup view (e.g., accessible directly from Settings and/or
    Pantry header).
  - Present the equipment tiers (Microwave only, Microwave + kettle, Full kitchen) and extra appliances
    (air fryer, rice cooker, blender, toaster oven) in a clean, focused, full-screen management interface.
- Non-Destructive Update Flow:
  - Changing equipment tier or toggling appliances immediately updates the kitchen store state and
    persists locally.
  - Preserves all confirmed pantry ingredients, saved dietary restrictions, allergens, and history.
  - Immediately recalculates recipe feasibility across Now recommendations and Plan journeys.
- Feedback & Navigation:
  - Provide clear confirmation of updated equipment and an easy return path back to Cook or Pantry.
  - Maintain full keyboard navigation, minimum 44×44 touch targets, theme support, and clear accessibility
    roles/hints.

Tests & Verification:
- Add screen and store tests proving that updating equipment via the kitchen management view updates
  engine constraints while preserving existing pantry contents and preferences.
- Verify accessibility labels, focus management, and responsive layout across mobile and desktop.
- Run npm run check and review the final diff.
```

## Prompt 12: Implement the Weekly Meal Prep reversal journey and active reminder scheduling

```text
Implement the complete Weekly Meal Prep experience in DecisionEats, featuring the “meal prep reversal”
workflow that derives consolidated grocery lists from user meal prep choices and schedules cooking
reminders.

Before coding, read docs/agentic/OPERATING_SYSTEM.md, docs/00_PRODUCT_DIRECTION.md,
docs/04_UIUX_SPEC.md, docs/specs/2026-08-13-weekly-meal-prep-design.md,
docs/specs/2026-08-13-meal-prep-notifications-design.md, docs/specs/2026-08-22-dual-meal-journeys-design.md,
and inspect src/engine/plan-week.ts, src/engine/plan-grocery-needs.ts, and src/lib/meal-prep-notifications.ts.

Current problem:
1. The Weekly Meal Prep journey is missing from the primary app experience (there is no Plan tab or
   guided planning flow in app/(tabs)/).
2. The core “reversal” concept—where planning meals for the week automatically generates a consolidated
   grocery list of missing ingredients based on user decisions—is not accessible to users.
3. Meal prep cooking reminders exist in isolation in Settings without being connected to confirmed
   weekly meal prep plans.

Required behavior:
- Plan Tab & Navigation:
  - Add the Plan destination as a primary tab in app/(tabs)/ (Cook, Plan, Pantry) or dedicated journey.
- 3-Step Guided Planning Tree:
  - Step 1 (Days): Select how many days to plan (e.g., 3 days, 5 days, 7 days).
  - Step 2 (Prep Style): Quick meals, batch prep, or a balanced mix.
  - Step 3 (Variety): Variety across meals or comfortable repeats.
- Deterministic Plan Generation & Meal Swap:
  - Generate a recommended plan honoring all hard constraints (equipment, allergens, diet) and pantry state.
  - Allow users to review each day's planned meal and swap/replace individual meals on demand.
- The Meal Prep Reversal (“What to get” Grocery List):
  - Once the plan is confirmed, derive the consolidated missing ingredient list using `plan-grocery-needs`.
  - Group repeated ingredient needs across multiple meals and clearly indicate which meals require each item.
  - Exclude ingredients already present in the user's pantry.
  - Allow checking off or adding purchased items directly to the pantry upon user confirmation.
- Active Cooking Reminders Integration:
  - When a plan is confirmed and reminders are enabled, automatically schedule local notifications
    for each concrete planned meal using the user's selected lead time (0, 10, 15, 30, 60 minutes).
  - Clear stale reminders when a plan is replaced or reset.
  - Web platform shows honest unsupported/no-op state without errors.

Tests & Verification:
- Add tests covering the full decision tree, deterministic plan proposal, individual meal swaps,
  consolidated grocery list calculation from planned meals, pantry subtraction, reminder scheduling on
  plan confirmation, and tab accessibility.
- Run focused tests and npm run check, and review the final diff.
```
