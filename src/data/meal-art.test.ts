import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import recipes from '@/data/recipes.json';
import {
  MEAL_ART_COLUMNS,
  MEAL_ART_ROWS,
  MEAL_ART_TILES,
  MEAL_ART_FALLBACK,
  mealArtTile,
} from '@/data/meal-art';

describe('bundled meal artwork', () => {
  it('retains registered artwork and uses the neutral tile for source recipes without art', () => {
    const ids = new Set(recipes.map((recipe) => recipe.id));
    for (const id of Object.keys(MEAL_ART_TILES)) {
      expect(ids.has(id)).toBe(true);
      expect(mealArtTile(id)).toBeGreaterThanOrEqual(0);
      expect(mealArtTile(id)).toBeLessThan(MEAL_ART_FALLBACK);
    }
    for (const recipe of recipes.filter((recipe) => !Object.hasOwn(MEAL_ART_TILES, recipe.id))) {
      expect(mealArtTile(recipe.id)).toBe(MEAL_ART_FALLBACK);
    }
    expect(new Set(Object.values(MEAL_ART_TILES)).size).toBe(Object.keys(MEAL_ART_TILES).length);
  });

  it('uses a neutral fallback for unknown IDs without matching titles or prototype keys', () => {
    for (const id of [undefined, '', 'unknown', '__proto__', 'constructor']) {
      expect(mealArtTile(id)).toBe(MEAL_ART_FALLBACK);
    }
    expect(MEAL_ART_FALLBACK).toBeLessThan(MEAL_ART_COLUMNS * MEAL_ART_ROWS);
  });

  it('ships a valid PNG atlas and documents its illustrative nature', () => {
    const asset = new URL('../../assets/meal-art/servings.png', import.meta.url);
    expect(existsSync(asset)).toBe(true);
    const bytes = readFileSync(asset);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(960);
    expect(bytes.readUInt32BE(20)).toBeGreaterThanOrEqual(1500);
  });
});
