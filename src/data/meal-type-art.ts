import { BUNDLED_CATALOG as recipes } from './catalog';
import reviewedTypes from './recipe-meal-types.json';

export const MEAL_TYPE_ART = {
  rice: { atlas: 'servings', tile: 32, label: 'Rice bowl' },
  couscous: { atlas: 'servings', tile: 18, label: 'Couscous bowl' },
  quinoa: { atlas: 'servings', tile: 22, label: 'Quinoa bowl' },
  pasta: { atlas: 'servings', tile: 2, label: 'Pasta' },
  noodles: { atlas: 'servings', tile: 2, label: 'Noodles' },
  eggs: { atlas: 'servings', tile: 36, label: 'Egg dish' },
  toast: { atlas: 'servings', tile: 33, label: 'Toast' },
  sandwich: { atlas: 'servings', tile: 34, label: 'Sandwich' },
  beans: { atlas: 'servings', tile: 25, label: 'Bean dish' },
  pizza: { atlas: 'servings', tile: 26, label: 'Pizza' },
  porridge: { atlas: 'servings', tile: 7, label: 'Porridge' },
  fish: { atlas: 'servings', tile: 20, label: 'Fish dish' },
  soup: { atlas: 'meal-types', tile: 0, label: 'Soup or stew' },
  salad: { atlas: 'meal-types', tile: 1, label: 'Salad' },
  pancakes: { atlas: 'meal-types', tile: 2, label: 'Pancakes or fritters' },
  chicken: { atlas: 'meal-types', tile: 3, label: 'Chicken dish' },
  smoothie: { atlas: 'meal-types', tile: 4, label: 'Smoothie' },
  potatoes: { atlas: 'meal-types', tile: 5, label: 'Potato dish' },
  plantain: { atlas: 'meal-types', tile: 6, label: 'Plantain dish' },
  dip: { atlas: 'meal-types', tile: 7, label: 'Dip or spread' },
  fruit: { atlas: 'meal-types', tile: 8, label: 'Fruit bowl' },
} as const;

export type MealType = keyof typeof MEAL_TYPE_ART;
export type MealTypeArt = (typeof MEAL_TYPE_ART)[MealType];
const reviewed: Readonly<Record<string, string>> = reviewedTypes;
const templateBases: Readonly<Record<string, MealType>> = {
  rice: 'rice',
  couscous: 'couscous',
  quinoa: 'quinoa',
  pasta: 'pasta',
  'rice-noodles': 'noodles',
};

/** Presentation only: reviewed IDs and explicit template bases, never title guesses. */
const byRecipe = new Map<string, MealTypeArt>();
for (const recipe of recipes) {
  const source = recipe.attribution;
  let kind = Object.hasOwn(reviewed, recipe.id) ? reviewed[recipe.id] : undefined;
  if (source?.sourceId === 'homechef-templates') {
    const base = source.sourceRecipeId?.split(':').at(-1) ?? '';
    kind = Object.hasOwn(templateBases, base) ? templateBases[base] : undefined;
  }
  if (kind && Object.hasOwn(MEAL_TYPE_ART, kind)) {
    byRecipe.set(recipe.id, MEAL_TYPE_ART[kind as MealType]);
  }
}

export function mealTypeArt(recipeId?: string): MealTypeArt | undefined {
  return recipeId ? byRecipe.get(recipeId) : undefined;
}
