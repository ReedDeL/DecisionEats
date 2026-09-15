import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import recipesJson from '@/data/recipes.json';
import { INGREDIENT_VOCABULARY, BUNDLED_CATALOG, lookupIngredient } from '@/data/catalog';
import { decideWithRelaxation } from '@/engine/relax';
import { EQUIPMENT } from '@/engine/types';

/**
 * Contract tests over the REAL generated catalog, not fixtures.
 *
 * The pipeline is Python and the engine is TypeScript, so nothing but a test
 * like this catches the two drifting apart. A pipeline change that emits a
 * value the engine cannot read fails here rather than at 6pm on a user's phone.
 */
describe('bundled catalog', () => {
  it('is not empty', () => {
    expect(BUNDLED_CATALOG.length).toBeGreaterThan(0);
  });

  it('survives adapter parsing without dropping records', () => {
    // toCatalog silently skips malformed entries, so a shortfall here means
    // the generator emitted something the adapter rejected.
    expect(BUNDLED_CATALOG.length).toBeGreaterThan(20);
  });

  it('has a unique id for every recipe', () => {
    const ids = BUNDLED_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only equipment values inside the closed enum', () => {
    for (const recipe of BUNDLED_CATALOG) {
      expect(recipe.equipmentRequired.length).toBeGreaterThan(0);
      for (const item of recipe.equipmentRequired) {
        expect(EQUIPMENT).toContain(item);
      }
    }
  });

  it('gives every recipe a positive cook time', () => {
    for (const recipe of BUNDLED_CATALOG) {
      expect(recipe.totalTimeMinutes).toBeGreaterThan(0);
    }
  });

  it('gives every recipe at least one ingredient', () => {
    for (const recipe of BUNDLED_CATALOG) {
      expect(recipe.ingredients.length).toBeGreaterThan(0);
    }
  });

  it('gives every recipe explicit safe nutrition fields', () => {
    for (const raw of recipesJson) {
      for (const key of [
        'baseServings',
        'energyKcalPerServing',
        'nutritionProvenance',
        'nutritionConfidence',
      ]) {
        expect(Object.hasOwn(raw, key)).toBe(true);
      }
    }
    for (const recipe of BUNDLED_CATALOG) {
      if (recipe.nutritionConfidence === 'low' || recipe.nutritionConfidence === 'unavailable') {
        expect(recipe.energyKcalPerServing).toBeNull();
      }
    }
  });

  it('references only ingredients present in the vocabulary', () => {
    // The pantry set-difference is a lookup by id. An ingredient a recipe needs
    // but the vocabulary does not know is unreachable from the pantry forever.
    const missing = new Set<string>();
    for (const recipe of BUNDLED_CATALOG) {
      for (const ingredient of recipe.ingredients) {
        if (!lookupIngredient(ingredient.id)) missing.add(ingredient.id);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('has at least 4 distinct non-empty cuisines backed by real recipes', () => {
    const cuisines = new Set(
      BUNDLED_CATALOG.map((r) => r.cuisine).filter((c): c is string => Boolean(c))
    );
    expect(cuisines.size).toBeGreaterThanOrEqual(4);
  });

  it('ensures all cuisine values are canonical lowercase slugs', () => {
    for (const recipe of BUNDLED_CATALOG) {
      if (recipe.cuisine !== null) {
        expect(recipe.cuisine).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });
});

describe('bundled ingredient vocabulary', () => {
  it('is not empty', () => {
    expect(INGREDIENT_VOCABULARY.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    const ids = INGREDIENT_VOCABULARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses no whitespace or uppercase in ids', () => {
    for (const entry of INGREDIENT_VOCABULARY) {
      expect(entry.id).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

/**
 * The microwave-only user is the wedge
 * (docs/specs/2026-08-06-microwave-seed-catalog-design.md). TheMealDB supplies exactly two
 * microwave-only recipes and both are 240-minute fudge, which the time ladder
 * cannot reach — so without the hand-curated seed this user sees nothing at all.
 */
describe('microwave coverage', () => {
  const microwaveOnly = BUNDLED_CATALOG.filter(
    (r) => r.equipmentRequired.length === 1 && r.equipmentRequired[0] === 'microwave'
  );

  it('carries at least 20 recipes that require a microwave', () => {
    const requiring = BUNDLED_CATALOG.filter((r) => r.equipmentRequired.includes('microwave'));
    expect(requiring.length).toBeGreaterThanOrEqual(20);
  });

  it('keeps the hand-curated seed in the built catalog', () => {
    // The build merges tools/catalog/seed/*.json. If a rebuild ever drops the
    // merge step, src/data/ is regenerated without it and this is the only
    // thing that notices.
    const seeded = BUNDLED_CATALOG.filter((r) => r.id.startsWith('hc-mw-'));
    expect(seeded.length).toBe(27);
  });

  it('gives the microwave-only user recipes reachable within an hour', () => {
    const reachable = microwaveOnly.filter((r) => r.totalTimeMinutes <= 60);
    expect(reachable.length).toBeGreaterThanOrEqual(20);
  });

  it('serves a microwave-only user with a realistic pantry', () => {
    const result = decideWithRelaxation(
      BUNDLED_CATALOG,
      new Set(['egg', 'milk', 'butter', 'salt', 'onion', 'garlic']),
      {
        equipment: ['microwave'],
        allergens: [],
        dietary: [],
        dislikedRecipeIds: new Set(),
        skippedRecipeIds: new Set(),
        preferredCuisine: null,
      },
      15
    );

    expect(Object.values(result.buckets).flat().length).toBeGreaterThan(0);
  });

  // The regression this whole change exists to prevent. Before it, the 76
  // unclassified recipes were tagged `none`, which the keyword fallback treats
  // as always satisfied — so they were served to microwave-only users as though
  // verified. Nothing in the catalog may claim `none` unless it was earned.
  it('no longer ships recipes tagged "none" by the keyword fallback', () => {
    const claimingNone = BUNDLED_CATALOG.filter(
      (r) => r.equipmentRequired.includes('none') && !r.id.startsWith('hc-staple-')
    );
    const reviews = readFileSync(
      new URL('../../tools/catalog/reviews/wikibooks-2026-09/reviews.jsonl', import.meta.url),
      'utf8'
    )
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as {
            candidate_id: string;
            recipe: { equipment: string[] };
          }
      );
    for (const recipe of claimingNone) {
      expect(recipe.attribution?.sourceId).toBe('wikibooks-expanded');
      const review = reviews.find((row) => row.candidate_id === recipe.attribution?.sourceRecipeId);
      expect(review?.recipe.equipment).toEqual(['none']);
    }
  });

  it('allows verified curated staple recipes to claim no equipment ("none")', () => {
    const stapleNone = BUNDLED_CATALOG.filter(
      (r) => r.id.startsWith('hc-staple-') && r.equipmentRequired.includes('none')
    );
    expect(stapleNone.length).toBeGreaterThan(0);
    for (const recipe of stapleNone) {
      expect(recipe.equipmentRequired).toEqual(['none']);
    }
  });

  it('quarantines unclassified recipes instead of shipping them', () => {
    const unclassified = BUNDLED_CATALOG.filter((r) =>
      r.equipmentRequired.includes('unclassified')
    );
    expect(unclassified).toEqual([]);
  });
});

describe('curated staple recipe coverage', () => {
  it('includes Peanut Butter and Jelly Sandwich when bread, peanut butter, and jam are in pantry', () => {
    const result = decideWithRelaxation(
      BUNDLED_CATALOG,
      new Set(['bread', 'peanut_butter', 'jam']),
      {
        equipment: ['microwave'],
        allergens: [],
        dietary: [],
        dislikedRecipeIds: new Set(),
        skippedRecipeIds: new Set(),
        preferredCuisine: null,
      },
      15
    );

    const readyIds = result.buckets.ready.map((s) => s.recipe.id);
    expect(readyIds).toContain('hc-staple-pbj');
  });

  it('excludes PB&J when peanut allergen is declared', () => {
    const result = decideWithRelaxation(
      BUNDLED_CATALOG,
      new Set(['bread', 'peanut_butter', 'jam']),
      {
        equipment: ['microwave'],
        allergens: ['peanut'],
        dietary: [],
        dislikedRecipeIds: new Set(),
        skippedRecipeIds: new Set(),
        preferredCuisine: null,
      },
      15
    );

    const allIds = Object.values(result.buckets)
      .flat()
      .map((s) => s.recipe.id);
    expect(allIds).not.toContain('hc-staple-pbj');
  });
});

describe('the real catalog never yields an empty screen', () => {
  const pantry = new Set(['egg', 'milk', 'butter', 'salt', 'onion', 'garlic']);

  for (const equipment of [['microwave'], ['microwave', 'kettle'], ['stove', 'oven']] as const) {
    for (const timeLimit of [15, 30, 60]) {
      it(`returns something for ${equipment.join('+')} at ${timeLimit} min`, () => {
        const result = decideWithRelaxation(
          BUNDLED_CATALOG,
          pantry,
          {
            equipment: [...equipment],
            allergens: [],
            dietary: [],
            dislikedRecipeIds: new Set(),
            skippedRecipeIds: new Set(),
            preferredCuisine: null,
          },
          timeLimit
        );

        const total = Object.values(result.buckets).flat().length;
        expect(total).toBeGreaterThan(0);
      });
    }
  }
});
