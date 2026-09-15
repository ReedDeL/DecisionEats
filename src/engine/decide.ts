import { BUCKET_ORDER, PER_BUCKET_RESULT_CAP } from '@/engine/bucket';
import { matchesCuisinePreference } from '@/engine/cuisine-preference';
import { hasAllergen, isEquipmentSatisfied, satisfiesDietary } from '@/engine/filter-hard';
import { scoreRecipe } from '@/engine/score-recipe';
import type {
  Bucket,
  DecisionResult,
  IngredientId,
  Minutes,
  Recipe,
  ScoredRecipe,
  UserPreferences,
} from '@/engine/types';

/**
 * The decision engine.
 *
 * Pure and synchronous over plain data. It takes a `Recipe[]` and does not know
 * or care whether bundled JSON or a live Spoonacular fetch supplied it —
 * which is what lets the whole suite run in milliseconds with no device, no
 * network, and no API quota.
 *
 * Hard constraints eliminate; soft constraints rank.
 */
export function decide(
  catalog: readonly Recipe[],
  pantry: ReadonlySet<IngredientId>,
  prefs: UserPreferences,
  timeLimit: Minutes
): DecisionResult {
  const survivors = catalog.filter(
    (r) =>
      // A recipe with no ingredients is a catalog defect, not a zero-effort
      // meal. Admitting it would put it straight into `ready`.
      r.ingredients.length > 0 &&
      !prefs.dislikedRecipeIds.has(r.id) &&
      isEquipmentSatisfied(r.equipmentRequired, prefs.equipment) &&
      !hasAllergen(r, prefs.allergens) &&
      satisfiesDietary(r, prefs.dietary) &&
      r.totalTimeMinutes <= timeLimit &&
      matchesCuisinePreference(r.cuisine, prefs.preferredCuisine)
  );

  const buckets = emptyBuckets();
  for (const recipe of survivors) {
    const scored = scoreRecipe(recipe, pantry, prefs, timeLimit);
    buckets[scored.bucket].push(scored);
  }

  for (const bucket of BUCKET_ORDER) {
    buckets[bucket] = buckets[bucket].sort(byScoreThenId).slice(0, PER_BUCKET_RESULT_CAP);
  }

  return { buckets, appliedRelaxations: [] };
}

export function emptyBuckets(): Record<Bucket, ScoredRecipe[]> {
  return { ready: [], missing_few: [], missing_some: [], grocery_run: [] };
}

/** Ties break on id so the list does not reshuffle between renders. */
function byScoreThenId(a: ScoredRecipe, b: ScoredRecipe): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.recipe.id < b.recipe.id ? -1 : a.recipe.id > b.recipe.id ? 1 : 0;
}
