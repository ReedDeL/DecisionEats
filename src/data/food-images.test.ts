import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BUNDLED_CATALOG, lookupIngredient } from './catalog';
import {
  FOOD_IMAGE_CREDITS,
  MEAL_IMAGE_CREDITS,
  foodImageSource,
  ingredientPhoto,
  mealPhoto,
} from './food-images';

describe('reviewed food images', () => {
  it('keeps meal mappings separate, licensed, reviewed, and pinned to bundled bytes', () => {
    for (const credit of MEAL_IMAGE_CREDITS) {
      expect(credit.reviewed).toBe(true);
      expect(credit.author).not.toBe('');
      expect(credit.source_url.startsWith('https://')).toBe(true);
      expect(credit.license_url.startsWith('https://')).toBe(true);
      const bytes = readFileSync(
        new URL('../../assets/meal-photos/' + credit.local_file, import.meta.url)
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(credit.sha256);
      expect(foodImageSource(credit.key)).toBeDefined();
      for (const id of credit.recipe_ids) {
        expect(BUNDLED_CATALOG.some((recipe) => recipe.id === id)).toBe(true);
        expect(mealPhoto(id)).toBe(credit);
        expect(ingredientPhoto(id)).toBeUndefined();
      }
    }
    expect(mealPhoto('rice')).toBeUndefined();
    expect(mealPhoto('unknown')).toBeUndefined();
  });
  it('ships licensed and checksummed local bytes for every approved mapping', () => {
    expect(FOOD_IMAGE_CREDITS.length).toBeGreaterThanOrEqual(35);
    for (const credit of FOOD_IMAGE_CREDITS) {
      expect(credit.reviewed).toBe(true);
      expect(credit.author.trim()).not.toBe('');
      expect(foodImageSource(credit.key)).toBeDefined();
      const bytes = readFileSync(
        new URL('../../assets/food-images/' + credit.local_file, import.meta.url)
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(credit.sha256);
      for (const id of credit.ingredient_ids) {
        expect(lookupIngredient(id), id).toBeDefined();
        expect(ingredientPhoto(id)?.key).toBe(credit.key);
      }
    }
  });

  it('does not guess photos for unknown or prepared ingredients', () => {
    expect(foodImageSource('__proto__')).toBeUndefined();
    expect(ingredientPhoto('cooked_chicken')).toBeUndefined();
    expect(ingredientPhoto('canned_tomatoes')).toBeUndefined();
  });
});
