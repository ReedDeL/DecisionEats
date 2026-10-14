import type { ImageSourcePropType } from 'react-native';

import credits from './food-image-credits.json';
import mealCredits from './meal-image-credits.json';
import { FOOD_IMAGE_SOURCES } from './food-image-sources';
import { MEAL_IMAGE_SOURCES } from './meal-image-sources';

const imageSources = { ...FOOD_IMAGE_SOURCES, ...MEAL_IMAGE_SOURCES };

export type FoodImageCredit = (typeof credits)[number];
export const FOOD_IMAGE_CREDITS: readonly FoodImageCredit[] = credits;
export const MEAL_IMAGE_CREDITS = mealCredits;
export function mealPhoto(recipeId?: string) {
  return mealCredits.find((credit) => credit.recipe_ids.includes(recipeId ?? ''));
}
const byIngredient = new Map(
  credits.flatMap((credit) => credit.ingredient_ids.map((id) => [id, credit] as const))
);

export function ingredientPhoto(id: string): FoodImageCredit | undefined {
  return byIngredient.get(id);
}

export function foodImageSource(key: string): ImageSourcePropType | undefined {
  if (!Object.hasOwn(imageSources, key)) return undefined;
  const source = imageSources[key as keyof typeof imageSources];
  return typeof source === 'string' ? { uri: source } : source;
}
