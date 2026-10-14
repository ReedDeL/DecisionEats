# DE-14: Nutrition display and intake contract

Status: design only. No calorie log, daily-total UI, medical targets, or nutrition values were added.

## Catalog evidence

The current `BUNDLED_CATALOG`, loaded through its normal adapter, contains 2,278 recipes.
None has non-null `energyKcalPerServing`. There are 2,067 low-confidence entries with
partial USDA provenance and 211 entries marked unavailable. A source reference is not
proof that every ingredient, quantity, cooking yield, and serving was resolved.
Do not expose partial nutrition as a complete meal's calories.

Source fields: `src/data/recipes.json`, `src/lib/adapters/to-recipe.ts`,
`src/contracts/meal-journeys.ts`, `src/engine/portion-guidance.ts`.
The audit used the shared catalog adapter, not a separate approximation of it.

## Slice A: informational nutrition display

- One serving means one of `baseServings` portions of the complete recipe. Display
  the recipe yield next to the calorie value. Never silently reinterpret grams,
  milliliters, a package, or the complete recipe as one serving.
- Display a numeric estimate only when energy is finite and positive, serving yield
  is known, and provenance passes the existing high/medium confidence boundary.
  Retain source version, source IDs, calculation date, matching method, and coverage.
- With current data, display “Calories unavailable” if a nutrition area is shown.
  Unknown is `null`, never zero. Do not infer calories from title, photo, cuisine,
  body size, or missing ingredient count.
- Label usable future values as estimates per recipe serving. Portion guidance is
  optional advice; it neither records eating nor proves calories consumed.
- Before enabling numbers, verify complete ingredient quantities, edible portions,
  cooking/yield assumptions and unit conversions against a documented source.

Acceptance: known fixture, missing/partial provenance, invalid yield, zero/NaN energy,
fractional portions, and unknown values. Catalog updates must not rewrite old logged
nutrition snapshots. No network request includes body metrics.

## Slice B: explicit, editable meal-intake log

Implement separately after Slice A's data acceptance. The proposed local record is:

| Field | Meaning |
|---|---|
| `id` | Stable generated entry identifier; editing preserves it |
| `ownerScope` | Device guest or signed-in user partition; no cross-user display/import |
| `consumedLocalDate` | User-chosen calendar date; retained across travel and timezone changes |
| `recordedAt`, `updatedAt` | ISO instants for audit/edit ordering |
| `recipeId`, `recipeTitle` | Bundled recipe reference and title snapshot |
| `servingsConsumed` | Explicit finite positive number of recipe servings |
| `baseServingsSnapshot` | Recipe yield used to interpret one serving |
| `energyKcalPerServingSnapshot` | Verified estimate or null |
| `nutritionProvenanceSnapshot` | Versioned source and confidence, or null |

“Log meal” asks for date and servings. Opening a recipe, confirming a weekly plan,
buying groceries, and receiving a reminder never log consumption automatically.
Provide edit date/servings, delete entry, and clear-log controls. Confirmed edits
recalculate only the affected days. Repeated meals are separate entries; accidental
double taps must not create duplicates.

Daily known total = sum of `servingsConsumed × energyKcalPerServingSnapshot` for
known entries, rounded only for presentation. If any entry is unknown, label the
result “Known calories” and show the count of meals without calorie data. A day
containing only unknown meals says “Total unavailable”; it does not show zero.
A day with no entries says “No meals logged.”

Reuse the existing local goal and height/weight editor without adding weight history
or converting portion advice into a daily target. Body data stays local. Initial
intake storage should be local and partitioned; cloud ownership, deletion, guest
import, and account-switch acceptance require a separate DE-02 slice before sync.
Do not reuse household pantry ownership for personal intake.

Acceptance: fractional servings, duplicate submit, edit, delete, midnight/date
boundaries, travel, unknown-only and mixed totals, restart persistence, account
switching and guest isolation. No clinical targets, macro dashboard, or inferred
consumption is included.
