import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { lookupIngredient } from './catalog';
import { FOOD_IMAGE_CREDITS, foodImageSource, ingredientPhoto } from './food-images';

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

  it('does not guess photos for unknown or prepared ingredients', () => {
    expect(foodImageSource('__proto__')).toBeUndefined();
    expect(ingredientPhoto('cooked_chicken')).toBeUndefined();
    expect(ingredientPhoto('canned_tomatoes')).toBeUndefined();
  });
});
