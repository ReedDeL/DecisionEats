import { describe, expect, it } from 'vitest';
import { BUNDLED_CATALOG, INGREDIENT_VOCABULARY } from '@/data/catalog';
import { decide } from '@/engine/decide';
import { hasAllergen } from '@/engine/filter-hard';
import { makePrefs } from '@/engine/__fixtures__';
import { resolveIngredient } from '@/lib/ingredients/resolve';

const templates = BUNDLED_CATALOG.filter(
  (recipe) => recipe.attribution?.sourceId === 'homechef-templates'
);

describe('expanded catalog integration with the existing decision engine', () => {
  it('retains thousands of complete options and the broad pantry vocabulary', () => {
    expect(templates).toHaveLength(2160);
    expect(BUNDLED_CATALOG.length).toBeGreaterThan(2200);
    expect(INGREDIENT_VOCABULARY.length).toBeGreaterThanOrEqual(901);
    for (const recipe of templates) {
      expect(recipe.mealSlots).toEqual(['lunch', 'dinner']);
      expect(recipe.baseServings).toBe(2);
      expect(recipe.instructions.length).toBeGreaterThan(1000);
      for (const ingredient of recipe.ingredients) {
        expect(resolveIngredient(ingredient.id).id).toBe(ingredient.id);
      }
    }
  });

  it('finds complete meals with a realistic pantry and retains bounded answers', () => {
    const pantry = new Set([
      'canned_chickpeas',
      'broccoli',
      'carrots',
      'rice',
      'garlic',
      'lemon_juice',
      'dried_oregano',
      'olive_oil',
    ]);
    const result = decide(BUNDLED_CATALOG, pantry, makePrefs({ equipment: ['stove'] }), 45);
    expect(
      result.buckets.ready.some(
        ({ recipe }) => recipe.attribution?.sourceId === 'homechef-templates'
      )
    ).toBe(true);
    expect(result.buckets.ready.length).toBeLessThanOrEqual(4);
  });

  it('keeps all generated stove recipes out of microwave-only results', () => {
    const result = decide(templates, new Set(), makePrefs({ equipment: ['microwave'] }), 120);
    expect(Object.values(result.buckets).flat()).toEqual([]);
  });

  it('excludes peanut, soy, and wheat combinations through the existing allergy gate', () => {
    for (const [ingredient, allergen] of [
      ['peanut_butter', 'peanut'],
      ['tofu', 'soy'],
      ['soy_sauce', 'wheat'],
      ['pasta', 'wheat'],
      ['couscous', 'wheat'],
    ] as const) {
      const affected = templates.filter((recipe) =>
        recipe.ingredients.some((item) => item.id === ingredient)
      );
      expect(affected.length).toBeGreaterThan(0);
      expect(affected.every((recipe) => hasAllergen(recipe, [allergen]))).toBe(true);
    }
  });

  it('does not count dried beans as the canned beans needed for a quick preparation', () => {
    const recipe = templates.find((row) =>
      row.ingredients.some((ingredient) => ingredient.id === 'canned_black_beans')
    )!;
    const pantry = new Set(recipe.ingredients.map((ingredient) => ingredient.id));
    pantry.delete('canned_black_beans');
    pantry.add('black_beans');
    const result = decide([recipe], pantry, makePrefs({ equipment: ['stove'] }), 45);
    expect(result.buckets.ready).toEqual([]);
    expect(result.buckets.missing_few[0]?.missing).toEqual(['canned_black_beans']);
  });
});
