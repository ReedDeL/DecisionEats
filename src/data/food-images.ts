import type { ImageSourcePropType } from 'react-native';

import credits from './food-image-credits.json';
import previews from './recipe-image-previews.json';
import { FOOD_IMAGE_SOURCES } from './food-image-sources';

export type FoodImageCredit = (typeof credits)[number];
export const FOOD_IMAGE_CREDITS: readonly FoodImageCredit[] = credits;
const byKey = new Map(credits.map((credit) => [credit.key, credit]));
const byIngredient = new Map(
  credits.flatMap((credit) => credit.ingredient_ids.map((id) => [id, credit] as const))
);
const previewKeys: Readonly<Record<string, readonly string[]>> = previews;

export function ingredientPhoto(id: string): FoodImageCredit | undefined {
  return byIngredient.get(id);
}

/** Presentation-only mappings materialized from the recipe's exact ingredient IDs. */
export function recipeIngredientPhotos(recipeId?: string): FoodImageCredit[] {
  if (!recipeId || !Object.hasOwn(previewKeys, recipeId)) return [];
  return (previewKeys[recipeId] ?? []).flatMap((key) => {
    const credit = byKey.get(key);
    return credit ? [credit] : [];
  });
}

export function foodImageSource(key: string): ImageSourcePropType | undefined {
  if (!Object.hasOwn(FOOD_IMAGE_SOURCES, key)) return undefined;
  const source = FOOD_IMAGE_SOURCES[key as keyof typeof FOOD_IMAGE_SOURCES];
  return typeof source === 'string' ? { uri: source } : source;
}
