# DecisionEats UX Production Fix Prompts

**Date:** September 4, 2026  
**Status:** Proposed implementation sequence  
**Source:** Hands-on UX feedback in DecisionEats UX Issues.md

Run these prompts one at a time, in order. Each is scoped as a reviewable production change. Do not combine them into one large pass.

## Prompt 1: Replace bundled kitchen tiers with an equipment checklist

Implement an atomic Kitchen Setup checklist. The current three tier cards bundle several pieces of equipment; users need to select the individual things they have.

Before coding, read docs/agentic/OPERATING_SYSTEM.md, docs/00_PRODUCT_DIRECTION.md, docs/04_UIUX_SPEC.md, app/(onboarding)/equipment.tsx, app/kitchen-setup.tsx, app/settings.tsx, src/store/kitchen.ts, src/engine/filter-hard.ts, and their tests. Inspect the existing diff and preserve unrelated work.

Requirements:

- Replace single-select tiers with accessible full-width checkbox rows for Microwave, Stovetop, Oven, Electric kettle, Air fryer, Rice cooker, Blender, and Toaster oven. Do not use capsules.
- Include “No cooking equipment,” mutually exclusive with every appliance.
- Reuse one checklist component in onboarding and Kitchen Setup. Settings may link to it but must not duplicate it.
- Persist the explicit equipment set as the engine source of truth.
- Add an idempotent local-state migration: microwave becomes microwave; kettle becomes microwave plus kettle; full becomes microwave, stove, oven, and kettle; merge old extras. Preserve pantry, restrictions, goals, plans, reminders, and history.
- Hard equipment filtering stays absolute. “No cooking equipment” permits only recipes verified as requiring none.
- An accidental empty state shows a concise validation message.
- Rows expose checkbox role/state, a 44x44 minimum target, visible focus, and support phone, desktop, dark mode, and 200% text.

Test migration, exclusivity, persistence, cross-screen parity, data preservation, all equipment filters, and accessibility. Run focused tests, npm run check, and review the final diff. Do not touch external communication or project-management systems.

## Prompt 2: Simplify optional goal details

Polish the optional-details section on Goals & Caloric Preferences.

Read the operating system, product direction, UI spec, app/(onboarding)/goals.tsx, src/lib/body-profile.ts, and related tests first.

Requirements:

- Keep “Add optional details” as progressive disclosure.
- Once expanded, label fields Current weight and Height and use the literal placeholder “Optional.”
- Remove copy that merely repeats that the fields are optional. If privacy context remains, use concise useful copy such as “Stored on this device and used for portion estimates.”
- Preserve unit toggles, validation, conversion, local-only storage, skip behavior, and clearing saved metrics.
- Do not change recommendation weights, health calculations, or collected data.

Test exact copy, expand/collapse, validation, units, keyboard behavior, accessibility labels, and that body metrics never enter analytics. Run focused tests and npm run check.

## Prompt 3: Make Pantry Starter photo-first, searchable, and checklist-based

Redesign the final onboarding Pantry Starter step so users can confirm common items, search the full vocabulary, or start with a photo.

Read the operating system, product direction, UI spec, photo-to-pantry spec, app/(onboarding)/staples.tsx, app/scan.tsx, src/store/kitchen.ts, src/data/ingredients.json, ingredient suggestion code, and tests.

Use this order:

1. Title and one short explanation.
2. A prominent full-width “Scan pantry with a photo” primary action with a real camera icon. Request permission only after activation; denial cannot block manual setup.
3. A “Search ingredients” field.
4. A virtualized vertical checkbox list, never ingredient capsules.
5. The existing Continue action.

Re-evaluate defaults:

- Define a short deterministic starter set based on common household usefulness and bundled-recipe coverage.
- Never preselect an ingredient conflicting with the prior allergen or dietary choices.
- Avoid expensive, highly perishable, culturally narrow, or uncommon assumptions.
- With no query, show starter items plus selected non-starter items. Search is case-insensitive, trimmed, alias-aware, and uses canonical IDs.
- Search must not lose selections. Confirmed photo detections merge idempotently as checked.
- Zero ingredients is valid. Never add unchecked items on Continue.
- Cover empty, no-result, permission-denied, scan-failure, and offline states.

Use checkbox semantics, 44x44 rows, visible focus, add/remove announcements, and a list suitable for the vocabulary size. Test defaults, safety exclusions, search, persistence, photo merge, zero-selection completion, errors, keyboard/focus, and responsive layout. Run focused tests and npm run check.

## Prompt 4: Fix cuisine choices at the catalog boundary

Fix the cuisine preference so production users see useful choices instead of only “Any” and “Italian.” Correct the data mismatch; do not hard-code dead filters.

Read the operating system, product direction, UI spec, src/lib/cuisines.ts, src/data/catalog.ts, src/lib/adapters/to-recipe.ts, tools/catalog/, app/(tabs)/index.tsx, and catalog/engine tests.

Requirements:

- Diagnose why curated candidate values do not match bundled catalog values. Normalize once during ingestion/adaptation rather than scattering UI aliases.
- Show “Any” plus only cuisines backed by catalog recipes. Expected labels include Italian, Chinese, Thai, Indian, British, French, Spanish, and American when source data exists.
- Every visible cuisine must have at least one candidate before pantry, time, and hard constraints apply. Never fabricate a mapping.
- Cuisine stays optional, does not auto-advance, and remains a soft preference that can only be explicitly relaxed after hard constraints remain satisfied.
- All choices must be reachable on phone and desktop without clipping.
- Add a catalog verification failure if production data yields fewer than four non-“Any” cuisines; include observed values in the diagnostic.

Test normalization, coverage, no dead options, Any, filtering/relaxation, keyboard reachability, and responsive layout. Rebuild artifacts only through the normal pipeline. Run focused tests and npm run check.

## Prompt 5: Extend weekly plans to meal slots and enforce variety

Upgrade the weekly-plan domain and engine from one entry per date to selected meal slots per date. This prompt is the data/engine foundation; leave visual redesign for Prompt 6.

Read the operating system, product direction, weekly journey specs, plan contracts and engine modules, grocery/reminder code, persistence adapters, Supabase queries/types, supabase/config.toml, migrations, and tests. Use the repository Supabase guidance. Check the installed CLI with help and current official changelog/docs. Create a new imperative migration; never edit an applied migration.

Domain requirements:

- Add a closed MealSlot type: breakfast, lunch, dinner.
- Users can choose one, two, or three slots. Dinner is the default and legacy value.
- Every entry has mealSlot. Require exactly one entry per selected date and slot, ordered by date then slot. Replace the fixed seven-entry invariant with coverage and uniqueness validation.
- Add explicit validated recipe slot-suitability metadata at one catalog boundary. Do not infer it from titles at recommendation time. Prefer slot matches; permit verified all-day recipes as fallback.
- Grocery needs aggregate across all slots. Reminder identity includes date, slot, and recipe ID.

Variety requirements:

- Variety mode uses every eligible hard-safe recipe before repeating and considers unused status before small score tie-breaks.
- Comfortable repeats permits repeats but avoids adjacent duplicates when another candidate exists and avoids using one recipe more than twice before exhausting the pool.
- A limited pantry never errors only because diversity is impossible. Fill slots with the safest best candidates, allow necessary repeats, and expose a deterministic limited-variety flag for UI copy.
- Identical inputs produce identical plans. Allergens, diet, and equipment are never relaxed.

Persistence requirements:

- Add meal_slot to weekly_meal_plan_entries, backfill dinner, make it non-null with a closed-value check, and replace uniqueness on plan plus date with plan plus date plus meal_slot.
- Preserve ownership foreign keys and RLS; do not use SECURITY DEFINER to bypass authorization.
- Update insert, replace, fetch, generated types, local state migration, fixtures, grocery joins, reminders, and validation. Old saved plans must migrate without loss.

Test 1/2/3 slots, 3/5/7 days, ordering/coverage, legacy migration, database uniqueness, RLS, deterministic ranking, both variety modes, a one-recipe fallback, adjacent-repeat avoidance, stable date-plus-slot swaps, grocery aggregation, and unique reminders. Verify local schema tests, run focused tests and npm run check.

## Prompt 6: Redesign weekly-plan navigation and cards

Build the user-facing weekly planner on Prompt 5’s contract. Do not start until Prompt 5 is complete.

Read the operating system, product direction, UI spec, app/(tabs)/plan.tsx, RecipeCard, responsive primitives, theme tokens, and updated contracts/tests.

Flow requirements:

- One decision per screen: number of days, meal slots, preparation style, variety, proposal.
- Selection changes state only. It never navigates or generates automatically.
- Put an explicit primary Next button in the sticky/footer area on every question. Disable it only with no valid selection. Back preserves earlier answers.
- The last step uses “Build my plan,” a busy state, duplicate-submit prevention, and a recoverable error that preserves selections.

Plan requirements:

- Group entries by friendly local date and label every card Breakfast, Lunch, or Dinner.
- Each concrete card shows recipe image, name, meal slot, time, and pantry fit. Reuse a shared image/card primitive. Use a stable food placeholder when imageUrl is null or fails.
- Swap one entry by date plus slot, never array index, and preserve every other entry.
- Remove “Why this plan works” completely without replacing it with another panel.
- If limited variety is reported, show one short inline note: “Your pantry has a small match set, so a few meals repeat.”
- Keep one recommended plan, “Use this plan,” and plan-linked “What to get.” Do not create a calendar of alternatives or a general shopping list.

Test non-auto-advance, explicit Next, state preservation, validation, single Build execution, images/fallbacks, meal labels, friendly dates, stable swaps, limited-variety copy, and absence of “Why this plan works.” Verify phone and real desktop layouts, 200% text, keyboard, focus, and reduced motion. Run focused tests, visual checks, and npm run check.

## Prompt 7: Rebuild Pantry as an image checklist with a centered camera action

Rebuild the main Pantry screen into a search-first image checklist. On phones, make photo scanning the centered camera action above bottom navigation.

Read the operating system, product direction, UI and responsive specs, photo-to-pantry spec, app/(tabs)/pantry.tsx, app/(tabs)/_layout.tsx, app/scan.tsx, catalog and suggestion code, photo confirmation, theme tokens, and tests.

Use this order:

1. Pantry title/count and secondary Settings action.
2. Search at the top of the working area.
3. One virtualized vertical ingredient checklist.
4. A centered circular camera button above bottom navigation on phone.

Requirements:

- With no query, list checked pantry items first, then a small suggested continuation. With a query, search the canonical vocabulary and retain checked state.
- Search is case-insensitive, trimmed, alias-aware, keyboard friendly, and clearable. Include empty and no-result states.
- Each row has a thumbnail, display name, concise factual detail, and trailing checkbox. The whole row toggles. Do not use capsules or text glyphs as checkboxes.
- Add typed validated ingredient presentation metadata. Bundle licensed local images for at least every starter/common item and a consistent local fallback for the rest. Do not hotlink or invent attribution. Store license/provenance beside assets.
- Detail text may describe category or common form, but must not make health claims or drive allergen safety.
- Announce local updates. If remote persistence is active and fails, roll back or expose retry; never show falsely saved state.
- On phone, use a real vector camera icon in a circular button centered just above the tab bar. It opens /scan and is not a fourth tab. Respect safe-area, keyboard, and tab-bar height; pad the list so the final row remains visible.
- On desktop, use a clear inline Scan pantry action instead of the floating control.
- Preserve permission-on-press, upload limits, confirmation before mutation, retry, and manual fallback.

Test search placement/ranking, selection persistence, images/fallbacks/details, checkbox semantics, persistence failure where applicable, photo merge, camera navigation, safe-area clearance, keyboard behavior, and desktop layout. Run focused tests, visual/browser checks, and npm run check.

## Prompt 8: Use a real gear icon for Settings everywhere

Update the shared Settings action to a real vector gear icon instead of text or emoji.

Read the operating system, product direction, UI spec, src/components/ui/SettingsAction.tsx and its tests, all call sites, package.json, and theme tokens.

Requirements:

- Use one shared vector gear icon. Never use a Unicode gear or emoji.
- Use the normal Expo-compatible package workflow. If the icon package is not a direct dependency, add the compatible pinned dependency and lockfile; do not draw an icon from text characters.
- The visible control is icon-only and secondary. Its accessible name is exactly “Settings”; contextual hints may remain.
- Keep a 44x44 minimum target, crisp alignment, visible hover/pressed/focus states, sufficient contrast, and consistent placement across every current entry point.
- Support native/web, light/dark themes, reduced motion, and 200% text. Do not redesign the Settings page or primary navigation.

Test vector rendering, absence of emoji and visible Settings text, accessible name, representative navigation, and theme/focus/pressed states. Run focused tests, visual checks, and npm run check.

## Shared completion bar

A prompt is complete only when its acceptance criteria have automated coverage, the flow is visually checked on phone and desktop web, npm run check passes, and the final diff is reviewed for unrelated changes. Allergens, dietary needs, and equipment remain absolute constraints.

