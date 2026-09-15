import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { BUNDLED_CATALOG, lookupIngredient } from './catalog';
import {
  FOOD_IMAGE_CREDITS,
  foodImageSource,
  ingredientPhoto,
  recipeIngredientPhotos,
} from './food-images';
import { MEAL_ART_TILES } from './meal-art';

describe('reviewed food images', () => {
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

  it('only previews ingredients actually present in each recipe', () => {
    let covered = 0;
    for (const recipe of BUNDLED_CATALOG) {
      const photos = recipeIngredientPhotos(recipe.id);
      if (photos.length && !Object.hasOwn(MEAL_ART_TILES, recipe.id)) covered++;
      expect(photos.length).toBeLessThanOrEqual(3);
      expect(new Set(photos.map((photo) => photo.key)).size).toBe(photos.length);
      for (const photo of photos) {
        expect(
          recipe.ingredients.some((ingredient) => photo.ingredient_ids.includes(ingredient.id))
        ).toBe(true);
      }
    }
    expect(covered).toBeGreaterThanOrEqual(2160);
  });

  it('does not guess photos for unknown recipes or prepared ingredients', () => {
    expect(recipeIngredientPhotos('__proto__')).toEqual([]);
    expect(recipeIngredientPhotos('unknown')).toEqual([]);
    expect(foodImageSource('__proto__')).toBeUndefined();
    expect(ingredientPhoto('cooked_chicken')).toBeUndefined();
    expect(ingredientPhoto('canned_tomatoes')).toBeUndefined();
  });
});
