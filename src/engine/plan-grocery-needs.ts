import type { PlanLinkedGroceryNeed, WeeklyMealPlan } from '@/contracts/meal-journeys';
import type { IngredientId, Recipe } from '@/engine/types';

export interface PlanGroceryEntry {
  date: string;
  recipe: Recipe;
}

/** Missing canonical IDs for one meal, shared by meal cards and grouped needs. */
export function getMissingPlanIngredientIds(
  recipe: Recipe,
  pantry: ReadonlySet<IngredientId>
): IngredientId[] {
  return [...new Set(recipe.ingredients.map((ingredient) => ingredient.id))].filter(
    (id) => !pantry.has(id)
  );
}

export function getPlanGroceryEntries(
  plan: WeeklyMealPlan,
  recipes: readonly Recipe[]
): PlanGroceryEntry[] {
  return plan.entries.flatMap((entry) => {
    if (entry.kind !== 'recipe') return [];
    const recipe = recipes.find((candidate) => candidate.id === entry.recipeId);
    return recipe ? [{ date: entry.date, recipe }] : [];
  });
}

/**
 * Resolve the concrete meal names behind one grouped grocery need.
 *
 * Grocery needs intentionally store stable recipe IDs rather than copied
 * titles. This presentation helper keeps that contract small while ensuring
 * the What to get surface explains exactly which meals use each ingredient.
 */
export function getPlanGroceryNeedMealNames(
  need: PlanLinkedGroceryNeed,
  recipes: readonly Recipe[]
): string[] {
  return need.recipeIds.map(
    (recipeId) => recipes.find((recipe) => recipe.id === recipeId)?.title ?? recipeId
  );
}

/** Recalculate a plan's linked grocery snapshot against the current pantry. */
export function recomputePlanGroceryNeeds(
  plan: WeeklyMealPlan,
  recipes: readonly Recipe[],
  pantry: ReadonlySet<IngredientId>,
  limit = 12
): WeeklyMealPlan {
  return {
    ...plan,
    groceryNeeds: derivePlanLinkedGroceryNeeds(getPlanGroceryEntries(plan, recipes), pantry, limit),
  };
}

interface GroceryReferences {
  recipeIds: Set<string>;
  dates: Set<string>;
}

export function derivePlanLinkedGroceryNeeds(
  entries: readonly PlanGroceryEntry[],
  pantry: ReadonlySet<IngredientId>,
  limit: number
): PlanLinkedGroceryNeed[] {
  if (!Number.isInteger(limit) || limit < 0 || limit > 12) {
    throw new RangeError('Grocery need limit must be an integer from 0 through 12');
  }

  const needs = derivePlanLinkedGroceryPreview(entries, pantry);
  if (needs.length > limit) {
    throw new RangeError(`Plan requires more than ${limit} grocery needs`);
  }
  return needs;
}

/** Read-only gap view; pantry edits can exceed the saved plan's 12-need cap. */
export function derivePlanLinkedGroceryPreview(
  entries: readonly PlanGroceryEntry[],
  pantry: ReadonlySet<IngredientId>
): PlanLinkedGroceryNeed[] {
  const referencesByIngredient = new Map<IngredientId, GroceryReferences>();

  for (const entry of entries) {
    const missingIngredientIds = getMissingPlanIngredientIds(entry.recipe, pantry);

    for (const ingredientId of missingIngredientIds) {
      const references = referencesByIngredient.get(ingredientId) ?? {
        recipeIds: new Set<string>(),
        dates: new Set<string>(),
      };
      references.recipeIds.add(entry.recipe.id);
      references.dates.add(entry.date);
      referencesByIngredient.set(ingredientId, references);
    }
  }

  return [...referencesByIngredient.entries()]
    .sort(([left], [right]) => compareIds(left, right))
    .map(([ingredientId, references]) => ({
      ingredientId,
      recipeIds: [...references.recipeIds].sort(compareIds),
      dates: [...references.dates].sort(compareIds),
    }));
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
