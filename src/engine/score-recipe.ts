import { bucketFor } from '@/engine/bucket';
import { matchesCuisinePreference } from '@/engine/cuisine-preference';
import type { IngredientId, Minutes, Recipe, ScoredRecipe, UserPreferences } from '@/engine/types';

/**
 * Scoring weights.
 *
 * The spec declares `ScoredRecipe.score` but never defines its terms
 * (Technical Spec §4.1), and the AI playbook says to write this by
 * hand. These weights are reasoned, not fitted — revisit after the Aug 18-22
 * user-testing round.
 *
 * Bucketing is by missing count, so score only orders recipes WITHIN a bucket.
 *
 * Coverage dominates because it is the user's actual question. The skip penalty
 * outweighs a marginal coverage gain because an explicit skip is the only
 * negative signal the user volunteers; a disliked recipe never reaches scoring
 * at all, since `decide` eliminates it outright.
 */
export const WEIGHTS = {
  coverage: 0.6,
  timeFit: 0.25,
  cuisineMatch: 0.15,
  calorieGoal: 0.1,
  skipPenalty: 0.3,
} as const;

export function scoreRecipe(
  recipe: Recipe,
  pantry: ReadonlySet<IngredientId>,
  prefs: UserPreferences,
  timeLimit: Minutes
): ScoredRecipe {
  const missing = recipe.ingredients.filter((ing) => !pantry.has(ing.id)).map((ing) => ing.id);

  const total = recipe.ingredients.length;
  const coverage = total === 0 ? 0 : (total - missing.length) / total;

  // Clamped so a recipe surfaced by time relaxation cannot drive the score
  // arbitrarily negative.
  const timeFit = timeLimit <= 0 ? 0 : clamp01(1 - recipe.totalTimeMinutes / timeLimit);

  const cuisineMatch =
    prefs.preferredCuisine !== null &&
    matchesCuisinePreference(recipe.cuisine, prefs.preferredCuisine)
      ? 1
      : 0;

  const skipped = prefs.skippedRecipeIds.has(recipe.id) ? 1 : 0;
  const calorieGoal = calorieGoalFit(recipe, prefs);

  const score =
    WEIGHTS.coverage * coverage +
    WEIGHTS.timeFit * timeFit +
    WEIGHTS.cuisineMatch * cuisineMatch +
    WEIGHTS.calorieGoal * calorieGoal -
    WEIGHTS.skipPenalty * skipped;

  return { recipe, missing, bucket: bucketFor(missing.length), score };
}

/**
 * Calories are a soft preference only. Missing or low-confidence nutrition
 * never removes a recipe and contributes no ranking signal.
 */
function calorieGoalFit(recipe: Recipe, prefs: UserPreferences): number {
  const energy = recipe.energyKcalPerServing;
  if (
    (recipe.nutritionConfidence !== 'high' && recipe.nutritionConfidence !== 'medium') ||
    energy === null ||
    !Number.isFinite(energy) ||
    energy <= 0
  )
    return 0;

  // Missing and explicit null preferences are neutral and leave standard ranking.
  const goal = prefs.bodyGoal ?? null;
  if (goal === null || goal === 'maintain') return 0;

  const normalized = Math.min(1, Math.max(0, energy / 1_000));
  return goal === 'lose' ? 1 - normalized : normalized;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
