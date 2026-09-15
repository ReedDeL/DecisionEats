import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import recipes from './recipes.json';
import reviewed from './recipe-meal-types.json';
import { MEAL_ART_TILES } from './meal-art';
import { MEAL_TYPE_ART, mealTypeArt } from './meal-type-art';

describe('meal-type defaults', () => {
  it('covers every bundled recipe with registered art or a meal-type default', () => {
    const uncovered = recipes.filter(
      (recipe) => !Object.hasOwn(MEAL_ART_TILES, recipe.id) && !mealTypeArt(recipe.id)
    );
    expect(uncovered.map((recipe) => recipe.title)).toEqual([]);
  });

  it('uses the exact declared base for all template variations', () => {
    const bases = {
      rice: 'Rice bowl',
      couscous: 'Couscous bowl',
      quinoa: 'Quinoa bowl',
      pasta: 'Pasta',
      'rice-noodles': 'Noodles',
    } as const;
    for (const recipe of recipes.filter(
      (item) => item.attribution?.sourceId === 'homechef-templates'
    )) {
      const base = recipe.attribution!.sourceRecipeId.split(':').at(-1)!;
      expect(mealTypeArt(recipe.id)?.label).toBe(bases[base as keyof typeof bases]);
    }
  });

  it('keeps reviewed assignments valid and distinguishes meal types', () => {
    const ids = new Set(recipes.map((recipe) => recipe.id));
    for (const [id, kind] of Object.entries(reviewed)) {
      expect(ids.has(id)).toBe(true);
      expect(Object.hasOwn(MEAL_TYPE_ART, kind)).toBe(true);
    }
    expect(mealTypeArt('hc-81bac4d1674a4232b1ad')?.label).toBe('Soup or stew');
    expect(mealTypeArt('hc-4286073bf884952d7abe')?.label).toBe('Salad');
    expect(mealTypeArt('hc-1fc67863fed01507b57d')?.label).toBe('Pancakes or fritters');
    expect(mealTypeArt('hc-fdab5f9f930aa512f728')?.label).toBe('Smoothie');
  });

  it('does not infer artwork from unknown IDs or title-like input', () => {
    for (const id of [undefined, '', 'Tomato Soup', '__proto__', 'constructor']) {
      expect(mealTypeArt(id)).toBeUndefined();
    }
  });

  it('ships a square three-by-three atlas and keeps tile coordinates in bounds', () => {
    const bytes = readFileSync(new URL('../../assets/meal-art/meal-types.png', import.meta.url));
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(bytes.readUInt32BE(20));
    expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(900);
    for (const art of Object.values(MEAL_TYPE_ART)) {
      expect(art.tile).toBeGreaterThanOrEqual(0);
      expect(art.tile).toBeLessThan(art.atlas === 'meal-types' ? 9 : 39);
    }
  });
});
