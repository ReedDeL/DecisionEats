import { describe, expect, it } from 'vitest';
import { decide } from '@/engine/decide';
import {
  ALL_EQUIPMENT,
  ingredient,
  makePrefs,
  makeRecipe,
  makeRecipeWithIngredients,
  pantry,
} from '@/engine/__fixtures__';

describe('decide — hard constraints eliminate', () => {
  it('uses explicit photo choices only for ties and never overrides readiness or hard constraints', () => {
    const a = makeRecipe({ id: 'a', ingredients: [ingredient('rice')] });
    const b = makeRecipe({ id: 'b', ingredients: [ingredient('rice')] });
    const unsafe = makeRecipe({ id: 'unsafe', equipmentRequired: ['oven'] });
    const gap = makeRecipe({ id: 'gap', ingredients: [ingredient('onion')] });
    const prefs = makePrefs({
      equipment: ['microwave'],
      photoSelectedRecipeIds: new Set(['b', 'unsafe', 'gap']),
    });
    const result = decide([a, b, unsafe, gap], pantry('rice'), prefs, 30);
    expect(result.buckets.ready.map(({ recipe }) => recipe.id)).toEqual(['b', 'a']);
    expect(result.buckets.missing_few.map(({ recipe }) => recipe.id)).toEqual(['gap']);
    expect(flatIds(result)).not.toContain('unsafe');
    expect(
      decide([a, b], pantry('rice'), makePrefs(), 30).buckets.ready.map(({ recipe }) => recipe.id)
    ).toEqual(['a', 'b']);
  });
  it('removes a recipe needing equipment the user lacks', () => {
    const catalog = [
      makeRecipe({ id: 'oven', equipmentRequired: ['oven'] }),
      makeRecipe({ id: 'micro', equipmentRequired: ['microwave'] }),
    ];
    const result = decide(
      catalog,
      pantry('egg', 'salt'),
      makePrefs({ equipment: ['microwave'] }),
      30
    );
    expect(flatIds(result)).toEqual(['micro']);
  });

  it('removes a recipe containing a declared allergen', () => {
    const catalog = [
      makeRecipe({ id: 'has-egg', ingredients: [ingredient('egg')] }),
      makeRecipe({ id: 'safe', ingredients: [ingredient('rice')] }),
    ];
    const result = decide(catalog, pantry('egg', 'rice'), makePrefs({ allergens: ['egg'] }), 30);
    expect(flatIds(result)).toEqual(['safe']);
  });

  it('removes a recipe over the time limit', () => {
    const catalog = [
      makeRecipe({ id: 'slow', totalTimeMinutes: 45 }),
      makeRecipe({ id: 'quick', totalTimeMinutes: 20 }),
    ];
    const result = decide(catalog, pantry('egg', 'salt'), makePrefs(), 20);
    expect(flatIds(result)).toEqual(['quick']);
  });

  it('removes a disliked recipe entirely', () => {
    const catalog = [makeRecipe({ id: 'nope' }), makeRecipe({ id: 'yes' })];
    const result = decide(
      catalog,
      pantry('egg', 'salt'),
      makePrefs({ dislikedRecipeIds: new Set(['nope']) }),
      30
    );
    expect(flatIds(result)).toEqual(['yes']);
  });

  it('excludes a session-skipped recipe and restores it when the skip is removed', () => {
    const catalog = [makeRecipe({ id: 'skip' }), makeRecipe({ id: 'keep' })];
    const skipped = decide(
      catalog,
      pantry('egg', 'salt'),
      makePrefs({ skippedRecipeIds: new Set(['skip']) }),
      30
    );
    expect(flatIds(skipped)).toEqual(['keep']);
    expect(flatIds(decide(catalog, pantry('egg', 'salt'), makePrefs(), 30))).toContain('skip');
  });

  it('reveals the next eligible ranked recipe when a top recipe is disliked', () => {
    // 5 recipes, top 4 are selected initially
    const catalog = Array.from({ length: 5 }, (_, i) =>
      makeRecipe({ id: `r${i}`, totalTimeMinutes: 10 + i, ingredients: [ingredient('egg')] })
    );
    const initial = decide(catalog, pantry('egg'), makePrefs(), 30);
    expect(initial.buckets.ready.map((s) => s.recipe.id)).toEqual(['r0', 'r1', 'r2', 'r3']);

    // Disliking r1 removes r1, preserves r0, r2, r3 in order, and reveals r4 as the replacement
    const updated = decide(
      catalog,
      pantry('egg'),
      makePrefs({ dislikedRecipeIds: new Set(['r1']) }),
      30
    );
    expect(updated.buckets.ready.map((s) => s.recipe.id)).toEqual(['r0', 'r2', 'r3', 'r4']);
  });

  it('preserves stable relative ordering and scores for unaffected recipes', () => {
    const catalog = [
      makeRecipe({ id: 'r0', totalTimeMinutes: 10, ingredients: [ingredient('egg')] }),
      makeRecipe({ id: 'r1', totalTimeMinutes: 15, ingredients: [ingredient('egg')] }),
      makeRecipe({ id: 'r2', totalTimeMinutes: 20, ingredients: [ingredient('egg')] }),
    ];
    const initial = decide(catalog, pantry('egg'), makePrefs(), 30);
    const updated = decide(
      catalog,
      pantry('egg'),
      makePrefs({ dislikedRecipeIds: new Set(['r0']) }),
      30
    );

    expect(updated.buckets.ready.map((s) => s.recipe.id)).toEqual(['r1', 'r2']);
    expect(updated.buckets.ready[0]?.score).toBe(initial.buckets.ready[1]?.score);
    expect(updated.buckets.ready[1]?.score).toBe(initial.buckets.ready[2]?.score);
  });
});

describe('decide — bucketing and truncation', () => {
  it('places recipes by missing count', () => {
    const catalog = [
      makeRecipeWithIngredients(2, { id: 'ready' }),
      makeRecipeWithIngredients(3, { id: 'few' }),
      makeRecipeWithIngredients(5, { id: 'some' }),
      makeRecipeWithIngredients(8, { id: 'grocery' }),
    ];
    // Pantry holds i0 and i1, so missing counts are 0, 1, 3 and 6.
    const result = decide(catalog, pantry('i0', 'i1'), makePrefs(), 30);

    expect(result.buckets.ready.map((s) => s.recipe.id)).toEqual(['ready']);
    expect(result.buckets.missing_few.map((s) => s.recipe.id)).toEqual(['few']);
    expect(result.buckets.missing_some.map((s) => s.recipe.id)).toEqual(['some']);
    expect(result.buckets.grocery_run.map((s) => s.recipe.id)).toEqual(['grocery']);
  });

  it('caps each bucket at 4 even with 9 qualifying recipes', () => {
    const catalog = Array.from({ length: 9 }, (_, i) =>
      makeRecipe({ id: `r${i}`, ingredients: [ingredient('egg')] })
    );
    const result = decide(catalog, pantry('egg'), makePrefs(), 30);
    expect(result.buckets.ready).toHaveLength(4);
  });

  it('keeps the highest-scoring recipes when truncating', () => {
    // Identical except for time: the fastest four must survive.
    const catalog = Array.from({ length: 9 }, (_, i) =>
      makeRecipe({ id: `t${i}`, totalTimeMinutes: i + 1, ingredients: [ingredient('egg')] })
    );
    const result = decide(catalog, pantry('egg'), makePrefs(), 30);
    expect(result.buckets.ready.map((s) => s.recipe.id)).toEqual(['t0', 't1', 't2', 't3']);
  });

  it('sorts by score descending within a bucket', () => {
    const catalog = Array.from({ length: 4 }, (_, i) =>
      makeRecipe({ id: `s${i}`, totalTimeMinutes: 20 - i, ingredients: [ingredient('egg')] })
    );
    const scores = decide(catalog, pantry('egg'), makePrefs(), 30).buckets.ready.map(
      (s) => s.score
    );
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('breaks ties stably by recipe id so the UI does not reshuffle', () => {
    const catalog = [
      makeRecipe({ id: 'b', ingredients: [ingredient('egg')] }),
      makeRecipe({ id: 'a', ingredients: [ingredient('egg')] }),
      makeRecipe({ id: 'c', ingredients: [ingredient('egg')] }),
    ];
    const first = decide(catalog, pantry('egg'), makePrefs(), 30);
    const second = decide([...catalog].reverse(), pantry('egg'), makePrefs(), 30);
    expect(first.buckets.ready.map((s) => s.recipe.id)).toEqual(['a', 'b', 'c']);
    expect(second.buckets.ready.map((s) => s.recipe.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not put a zero-ingredient recipe in ready', () => {
    const result = decide([makeRecipe({ ingredients: [] })], pantry(), makePrefs(), 30);
    expect(result.buckets.ready).toHaveLength(0);
  });

  it('returns four empty buckets, not undefined, for an empty catalog', () => {
    const result = decide([], pantry(), makePrefs(), 30);
    expect(result.buckets).toEqual({
      ready: [],
      missing_few: [],
      missing_some: [],
      grocery_run: [],
    });
    expect(result.appliedRelaxations).toEqual([]);
  });
});

describe('decide — pantry responsiveness', () => {
  it('moves a recipe from missing_few to ready when its missing ingredient is added', () => {
    const catalog = [
      makeRecipe({
        id: 'grilled-cheese',
        totalTimeMinutes: 10,
        ingredients: [ingredient('bread'), ingredient('cheddar_cheese'), ingredient('butter')],
      }),
      makeRecipe({
        id: 'scrambled-eggs',
        totalTimeMinutes: 5,
        ingredients: [ingredient('egg'), ingredient('butter')],
      }),
    ];

    // Initial pantry has bread, butter, egg -> scrambled-eggs is ready, grilled-cheese is missing_few (needs cheddar_cheese)
    const initialPantry = pantry('bread', 'butter', 'egg');
    const initial = decide(catalog, initialPantry, makePrefs(), 30);
    expect(initial.buckets.ready.map((s) => s.recipe.id)).toEqual(['scrambled-eggs']);
    expect(initial.buckets.missing_few.map((s) => s.recipe.id)).toEqual(['grilled-cheese']);
    expect(initial.buckets.missing_few[0]?.missing).toEqual(['cheddar_cheese']);

    // Add cheddar_cheese -> grilled-cheese moves immediately to ready
    const updatedPantry = pantry('bread', 'butter', 'egg', 'cheddar_cheese');
    const updated = decide(catalog, updatedPantry, makePrefs(), 30);
    expect(updated.buckets.ready.map((s) => s.recipe.id)).toEqual([
      'scrambled-eggs',
      'grilled-cheese',
    ]);
    expect(updated.buckets.missing_few).toHaveLength(0);
  });

  it('moves a recipe from ready to missing_few when an ingredient is removed', () => {
    const catalog = [
      makeRecipe({
        id: 'pbj',
        totalTimeMinutes: 5,
        ingredients: [ingredient('bread'), ingredient('peanut_butter'), ingredient('jam')],
      }),
    ];

    // Fully stocked pantry -> ready
    const stockedPantry = pantry('bread', 'peanut_butter', 'jam');
    const initial = decide(catalog, stockedPantry, makePrefs(), 30);
    expect(initial.buckets.ready.map((s) => s.recipe.id)).toEqual(['pbj']);

    // Remove jam -> missing_few with missing: ['jam']
    const depletedPantry = pantry('bread', 'peanut_butter');
    const updated = decide(catalog, depletedPantry, makePrefs(), 30);
    expect(updated.buckets.ready).toHaveLength(0);
    expect(updated.buckets.missing_few.map((s) => s.recipe.id)).toEqual(['pbj']);
    expect(updated.buckets.missing_few[0]?.missing).toEqual(['jam']);
  });

  it('improves relative ranking within a bucket when recipe coverage improves', () => {
    // Both r1 and r2 need 2 missing ingredients initially (missing_few)
    const catalog = [
      makeRecipe({
        id: 'r1',
        totalTimeMinutes: 15,
        ingredients: [
          ingredient('bread'),
          ingredient('butter'),
          ingredient('ham'),
          ingredient('cheese'),
        ],
      }),
      makeRecipe({
        id: 'r2',
        totalTimeMinutes: 15,
        ingredients: [
          ingredient('pasta'),
          ingredient('tomato_sauce'),
          ingredient('beef'),
          ingredient('parmesan'),
        ],
      }),
    ];

    // Pantry: bread, butter (r1 has 2/4 = 50%), pasta, tomato_sauce (r2 has 2/4 = 50%)
    // Tie breaks on id: r1 then r2
    const initial = decide(
      catalog,
      pantry('bread', 'butter', 'pasta', 'tomato_sauce'),
      makePrefs(),
      30
    );
    expect(initial.buckets.missing_few.map((s) => s.recipe.id)).toEqual(['r1', 'r2']);

    // Add 'beef' -> r2 now has 3/4 = 75% coverage (missing 1), r1 has 2/4 = 50% coverage (missing 2)
    // r2 scores higher and outranks r1
    const updated = decide(
      catalog,
      pantry('bread', 'butter', 'pasta', 'tomato_sauce', 'beef'),
      makePrefs(),
      30
    );
    expect(updated.buckets.missing_few.map((s) => s.recipe.id)).toEqual(['r2', 'r1']);
    expect(updated.buckets.missing_few[0]?.score).toBeGreaterThan(
      updated.buckets.missing_few[1]?.score ?? 0
    );
  });

  it('leaves ranking strictly unchanged and deterministic when an irrelevant ingredient is added', () => {
    const catalog = [
      makeRecipe({ id: 'r1', totalTimeMinutes: 10, ingredients: [ingredient('egg')] }),
      makeRecipe({ id: 'r2', totalTimeMinutes: 20, ingredients: [ingredient('bread')] }),
    ];

    const initial = decide(catalog, pantry('egg', 'bread'), makePrefs(), 30);
    const initialReady = initial.buckets.ready.map((s) => s.recipe.id);
    const initialScores = initial.buckets.ready.map((s) => s.score);

    // Add 'cinnamon' which neither recipe uses
    const updated = decide(catalog, pantry('egg', 'bread', 'cinnamon'), makePrefs(), 30);
    expect(updated.buckets.ready.map((s) => s.recipe.id)).toEqual(initialReady);
    expect(updated.buckets.ready.map((s) => s.score)).toEqual(initialScores);
  });

  it('calculates recommendations dynamically under Any cuisine preference', () => {
    const catalog = [
      makeRecipe({
        id: 'italian-pasta',
        cuisine: 'italian',
        totalTimeMinutes: 15,
        ingredients: [ingredient('pasta'), ingredient('garlic')],
      }),
      makeRecipe({
        id: 'mexican-tacos',
        cuisine: 'mexican',
        totalTimeMinutes: 15,
        ingredients: [ingredient('tortilla'), ingredient('beans')],
      }),
    ];

    // Any cuisine (preferredCuisine: null)
    // When only pasta + garlic in pantry, italian-pasta is ready, mexican-tacos is missing_few
    const pastaPantry = decide(
      catalog,
      pantry('pasta', 'garlic'),
      makePrefs({ preferredCuisine: null }),
      30
    );
    expect(pastaPantry.buckets.ready.map((s) => s.recipe.id)).toEqual(['italian-pasta']);
    expect(pastaPantry.buckets.missing_few.map((s) => s.recipe.id)).toEqual(['mexican-tacos']);

    // When pantry changes to tortilla + beans, mexican-tacos is ready, italian-pasta is missing_few
    const tacoPantry = decide(
      catalog,
      pantry('tortilla', 'beans'),
      makePrefs({ preferredCuisine: null }),
      30
    );
    expect(tacoPantry.buckets.ready.map((s) => s.recipe.id)).toEqual(['mexican-tacos']);
    expect(tacoPantry.buckets.missing_few.map((s) => s.recipe.id)).toEqual(['italian-pasta']);
  });
});

describe('decide — purity', () => {
  it('does not mutate its inputs', () => {
    const catalog = [makeRecipeWithIngredients(3)];
    const snapshot = structuredClone(catalog);
    const prefs = makePrefs({ equipment: [...ALL_EQUIPMENT] });
    const pantrySet = pantry('i0');

    decide(catalog, pantrySet, prefs, 30);

    expect(catalog).toEqual(snapshot);
    expect([...pantrySet]).toEqual(['i0']);
    expect(prefs.equipment).toEqual(ALL_EQUIPMENT);
  });
});

function flatIds(result: ReturnType<typeof decide>): string[] {
  return Object.values(result.buckets)
    .flat()
    .map((s) => s.recipe.id)
    .sort();
}
