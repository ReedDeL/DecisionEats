import type { ImageSourcePropType } from 'react-native';

import credits from './food-image-credits.json';
import { FOOD_IMAGE_SOURCES } from './food-image-sources';

export type FoodImageCredit = (typeof credits)[number];
export const FOOD_IMAGE_CREDITS: readonly FoodImageCredit[] = credits;
const byIngredient = new Map(
  credits.flatMap((credit) => credit.ingredient_ids.map((id) => [id, credit] as const))
);

export function ingredientPhoto(id: string): FoodImageCredit | undefined {
  return byIngredient.get(id);
}

export function foodImageSource(key: string): ImageSourcePropType | undefined {
  if (!Object.hasOwn(FOOD_IMAGE_SOURCES, key)) return undefined;
  const source = FOOD_IMAGE_SOURCES[key as keyof typeof FOOD_IMAGE_SOURCES];
  return typeof source === 'string' ? { uri: source } : source;
}
