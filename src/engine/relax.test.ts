import { describe, expect, it } from 'vitest';
import { decideWithRelaxation, TIME_TIERS } from '@/engine/relax';
import { ALL_EQUIPMENT, ingredient, makePrefs, makeRecipe, pantry } from '@/engine/__fixtures__';
import type { Recipe, UserPreferences } from '@/engine/types';

const kinds = (r: ReturnType<typeof decideWithRelaxation>): string[] =>
  r.appliedRelaxations.map((x) => x.kind);

const total = (r: ReturnType<typeof decideWithRelaxation>): number =>
  Object.values(r.buckets).flat().length;

describe('decideWithRelaxation — the ladder', () => {
  it('keeps a thin nonempty result without widening to additional ready meals', () => {
    const catalog = [
      makeRecipe({ id: 'quick', totalTimeMinutes: 10, ingredients: [ingredient('egg')] }),
      ...Array.from({ length: 3 }, (_, index) =>
        makeRecipe({
          id: `slower-${index}`,
          totalTimeMinutes: 30,
          ingredients: [ingredient('egg')],
        })
      ),
    ];

    const result = decideWithRelaxation(catalog, pantry('egg'), makePrefs(), 15);

    expect(result.buckets.ready.map(({ recipe }) => recipe.id)).toEqual(['quick']);
    expect(result.appliedRelaxations).toEqual([]);
    expect(result.shouldFetchSpoonacular).toBe(true);
  });

  it('concedes nothing when the unrelaxed result is already good', () => {
    const catalog = Array.from({ length: 3 }, (_, i) =>
      makeRecipe({ id: `r${i}`, totalTimeMinutes: 10, ingredients: [ingredient('egg')] })
    );
    const result = decideWithRelaxation(catalog, pantry('egg'), makePrefs(), 15);
    expect(result.appliedRelaxations).toEqual([]);
    expect(result.buckets.ready).toHaveLength(3);
  });

  it('widens time by one tier and reports it', () => {
    const catalog = [makeRecipe({ totalTimeMinutes: 30, ingredients: [ingredient('egg')] })];
    const result = decideWithRelaxation(catalog, pantry('egg'), makePrefs(), 15);

    expect(kinds(result)).toContain('time_widened');
    expect(result.appliedRelaxations[0]).toEqual({ kind: 'time_widened', from: 15, to: 30 });
    expect(total(result)).toBe(1);
  });

  it('drops the cuisine preference only after widening time', () => {
    // Nothing thai at any duration; one american recipe at 30 min.
    const catalog = [
      makeRecipe({
        id: 'us',
        cuisine: 'american',
        totalTimeMinutes: 30,
        ingredients: [ingredient('egg')],
      }),
    ];
    const prefs = makePrefs({ preferredCuisine: 'thai' });
    const result = decideWithRelaxation(catalog, pantry('egg'), prefs, 15);

    expect(kinds(result)).toEqual(expect.arrayContaining(['time_widened', 'cuisine_dropped']));
    expect(kinds(result).indexOf('time_widened')).toBeLessThan(
      kinds(result).indexOf('cuisine_dropped')
    );
    expect(total(result)).toBe(1);
  });

  it('promotes missing_few when nothing is fully ready', () => {
    const catalog = [
      makeRecipe({ id: 'nearly', ingredients: [ingredient('egg'), ingredient('milk')] }),
    ];
    const result = decideWithRelaxation(catalog, pantry('egg'), makePrefs(), 15);

    expect(kinds(result)).toContain('bucket_promoted');
    expect(result.buckets.missing_few).toHaveLength(1);
  });

  it('flags a Spoonacular fetch when the bundled catalog stays thin', () => {
    const catalog = [makeRecipe({ ingredients: [ingredient('egg')] })];
    const result = decideWithRelaxation(catalog, pantry('egg'), makePrefs(), 15);
    // One ready recipe is below the target of 3.
    expect(result.shouldFetchSpoonacular).toBe(true);
  });

  it('does not flag a Spoonacular fetch when the bundled catalog is sufficient', () => {
    const catalog = Array.from({ length: 4 }, (_, i) =>
      makeRecipe({ id: `r${i}`, ingredients: [ingredient('egg')] })
    );
    const result = decideWithRelaxation(catalog, pantry('egg'), makePrefs(), 15);
    expect(result.shouldFetchSpoonacular).toBe(false);
  });
});

describe('decideWithRelaxation — hard constraints never relax', () => {
  const catalog = [
    makeRecipe({
      id: 'unreachable',
      equipmentRequired: ['oven'],
      dietaryTags: [],
      totalTimeMinutes: 5,
      ingredients: [ingredient('peanut', ['nut'])],
    }),
  ];

  it('never surfaces a recipe needing equipment the user lacks', () => {
    const result = decideWithRelaxation(
      catalog,
      pantry('peanut'),
      makePrefs({ equipment: ['microwave'] }),
      15
    );
    expect(total(result)).toBe(0);
    expect(kinds(result)).not.toContain('equipment');
  });

  // `unclassified` means tagging failed. It is a hard exclusion like any other
  // equipment miss, so no rung of the ladder may admit it — not even the last,
  // and not even for a user who owns every appliance there is.
  it('never surfaces an unclassified recipe at any rung of the ladder', () => {
    const unclassifiedOnly = [
      makeRecipe({
        id: 'untagged',
        equipmentRequired: ['unclassified'],
        dietaryTags: [],
        totalTimeMinutes: 5,
        ingredients: [ingredient('egg')],
      }),
    ];

    for (const equipment of [['microwave'], [...ALL_EQUIPMENT]] as const) {
      const result = decideWithRelaxation(
        unclassifiedOnly,
        pantry('egg'),
        makePrefs({ equipment: [...equipment] }),
        15
      );
      expect(total(result)).toBe(0);
      expect(kinds(result)).not.toContain('equipment');
    }
  });

  it('never surfaces a recipe containing a declared allergen', () => {
    const result = decideWithRelaxation(
      catalog,
      pantry('peanut'),
      makePrefs({ allergens: ['nut'] }),
      15
    );
    expect(total(result)).toBe(0);
  });

  it('never surfaces a recipe violating a dietary restriction', () => {
    const result = decideWithRelaxation(
      catalog,
      pantry('peanut'),
      makePrefs({ dietary: ['vegan'] }),
      15
    );
    expect(total(result)).toBe(0);
  });

  it('reports only soft concessions, never a hard one', () => {
    const wide = [makeRecipe({ totalTimeMinutes: 60, ingredients: [ingredient('egg')] })];
    const result = decideWithRelaxation(wide, pantry('egg'), makePrefs(), 15);
    for (const r of result.appliedRelaxations) {
      expect([
        'time_widened',
        'cuisine_dropped',
        'spoonacular_expansion',
        'bucket_promoted',
      ]).toContain(r.kind);
    }
  });

  /**
   * The three cases above eliminate the only recipe, so the ladder runs out and
   * returns nothing — which passes whether the ladder climbed all four rungs or
   * short-circuited at the first. That is the weaker half of the requirement.
   *
   * This drives the ladder to its LAST rung and has it succeed there, with
   * three hard-violating recipes in the catalog that outrank the survivor at
   * every rung along the way.
   *
   * Each decoy violates exactly ONE hard constraint and is otherwise perfect,
   * so the three are individually diagnostic: weakening any single filter
   * surfaces its own decoy and nothing else. A single decoy that broke all
   * three rules at once would still be excluded by the other two filters if one
   * of them regressed, and the test would pass through the bug.
   */
  it('holds every hard constraint while climbing all four rungs to a result', () => {
    // Fast, right cuisine, fully in the pantry -- top of the ranking if allowed.
    const decoy = (overrides: Partial<Recipe>): Recipe =>
      makeRecipe({
        cuisine: 'thai',
        totalTimeMinutes: 5,
        equipmentRequired: ['microwave'],
        dietaryTags: ['vegan'],
        ingredients: [ingredient('rice')],
        ...overrides,
      });

    const catalog = [
      decoy({ id: 'decoy_equipment', equipmentRequired: ['oven'] }),
      decoy({ id: 'decoy_allergen', ingredients: [ingredient('peanut', ['nut'])] }),
      decoy({ id: 'decoy_dietary', dietaryTags: [] }),
      // Reachable only at the bottom of the ladder: needs the widest time tier,
      // the cuisine preference dropped, and a bucket promotion to surface.
      makeRecipe({
        id: 'reachable',
        cuisine: 'american',
        totalTimeMinutes: 120,
        equipmentRequired: ['microwave'],
        dietaryTags: ['vegan'],
        ingredients: [ingredient('rice'), ingredient('bean'), ingredient('lime')],
      }),
    ];

    const result = decideWithRelaxation(
      catalog,
      pantry('rice', 'peanut'),
      makePrefs({
        equipment: ['microwave'],
        allergens: ['nut'],
        dietary: ['vegan'],
        preferredCuisine: 'thai',
      }),
      15
    );

    // Rungs 1, 2 and 4/5 are reported; rung 3 is the caller's to execute.
    expect(kinds(result)).toEqual(
      expect.arrayContaining(['time_widened', 'cuisine_dropped', 'bucket_promoted'])
    );
    expect(result.appliedRelaxations).toContainEqual({ kind: 'time_widened', from: 15, to: 120 });
    expect(result.shouldFetchSpoonacular).toBe(true);

    // The ladder reached the bottom and produced something, so the absence
    // below is a real exclusion and not just an empty result.
    const ids = Object.values(result.buckets)
      .flat()
      .map((r) => r.recipe.id);
    expect(ids).toContain('reachable');
    expect(ids).not.toContain('decoy_equipment');
    expect(ids).not.toContain('decoy_allergen');
    expect(ids).not.toContain('decoy_dietary');
  });
});

// B10: "an empty results screen is structurally impossible"
// (Technical Spec §4.3). Made executable across the constraint space.
describe('decideWithRelaxation — B10 never-empty property', () => {
  const catalog = syntheticCatalog();

  const equipmentSets: UserPreferences['equipment'][] = [
    ['microwave'],
    ['microwave', 'kettle'],
    ['stove', 'oven', 'microwave'],
    ['air_fryer', 'microwave'],
  ];
  const timeLimits = [15, 30, 60];
  const cuisines = [null, 'thai', 'italian'];

  for (const equipment of equipmentSets) {
    for (const timeLimit of timeLimits) {
      for (const preferredCuisine of cuisines) {
        it(`returns something for ${equipment.join('+')} / ${timeLimit}min / ${preferredCuisine ?? 'any'}`, () => {
          const result = decideWithRelaxation(
            catalog,
            pantry('egg', 'rice', 'salt'),
            makePrefs({ equipment, preferredCuisine }),
            timeLimit
          );
          expect(total(result)).toBeGreaterThan(0);
        });
      }
    }
  }

  it('still returns something for the hardest case: microwave-only, 15 min, three allergens', () => {
    const result = decideWithRelaxation(
      catalog,
      pantry('egg', 'rice'),
      makePrefs({
        equipment: ['microwave'],
        allergens: ['nut', 'dairy', 'shellfish'],
      }),
      15
    );
    expect(total(result)).toBeGreaterThan(0);
  });
});

describe('TIME_TIERS', () => {
  it('is ascending', () => {
    expect([...TIME_TIERS]).toEqual([...TIME_TIERS].sort((a, b) => a - b));
  });
});

/** A catalog broad enough that the ladder always has somewhere to go. */
function syntheticCatalog(): Recipe[] {
  const recipes: Recipe[] = [];
  const equipmentOptions = [
    ['none'],
    ['microwave'],
    ['kettle'],
    ['stove'],
    ['oven'],
    ['air_fryer'],
  ] as const;
  const cuisineOptions = ['american', 'thai', 'italian', 'mexican'];
  const times = [5, 15, 25, 40, 90];

  let n = 0;
  for (const equipment of equipmentOptions) {
    for (const cuisine of cuisineOptions) {
      for (const totalTimeMinutes of times) {
        recipes.push(
          makeRecipe({
            id: `syn${n++}`,
            cuisine,
            totalTimeMinutes,
            equipmentRequired: [...equipment],
            ingredients: [ingredient('egg'), ingredient('rice'), ingredient('onion')],
          })
        );
      }
    }
  }
  return recipes;
}
