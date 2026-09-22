import { describe, expect, it } from 'vitest';
import { INGREDIENT_VOCABULARY, lookupIngredient } from '@/data/catalog';
import {
  DEFAULT_SUGGESTION_COUNT,
  INITIAL_PANTRY_RECOMMENDATIONS,
  MAX_SEARCH_RESULTS,
  PANTRY_RECOMMENDATION_BATCH_SIZE,
  RANKED_SUGGESTION_VOCABULARY,
  filterSafeStarterIngredients,
  getChecklistIngredientIds,
  getPantryRecommendationCandidates,
  getReplenishingSuggestions,
  searchIngredientSuggestions,
} from '@/lib/ingredients/suggestions';
import { COMMON_PANTRY_IDS } from '@/store/kitchen';

describe('RANKED_SUGGESTION_VOCABULARY', () => {
  it('contains all valid vocabulary ingredients without duplicates', () => {
    expect(RANKED_SUGGESTION_VOCABULARY.length).toBe(INGREDIENT_VOCABULARY.length);
    const uniqueIds = new Set(RANKED_SUGGESTION_VOCABULARY);
    expect(uniqueIds.size).toBe(INGREDIENT_VOCABULARY.length);

    for (const id of RANKED_SUGGESTION_VOCABULARY) {
      expect(lookupIngredient(id)).toBeDefined();
    }
  });

  it('prioritizes common pantry items at the front', () => {
    const commonSet = new Set(COMMON_PANTRY_IDS);
    const prefix = RANKED_SUGGESTION_VOCABULARY.slice(0, COMMON_PANTRY_IDS.length);

    for (const id of prefix) {
      expect(commonSet.has(id)).toBe(true);
    }
  });

  it('is deterministic across repeated calls', () => {
    const listA = [...RANKED_SUGGESTION_VOCABULARY];
    const listB = [...RANKED_SUGGESTION_VOCABULARY];
    expect(listA).toEqual(listB);
  });
});

describe('getReplenishingSuggestions', () => {
  it('returns DEFAULT_SUGGESTION_COUNT items for an empty pantry', () => {
    const suggestions = getReplenishingSuggestions([]);
    expect(suggestions).toHaveLength(DEFAULT_SUGGESTION_COUNT);
    expect(new Set(suggestions).size).toBe(DEFAULT_SUGGESTION_COUNT);
  });

  it('excludes owned pantry items and preserves visible count by revealing the next candidate', () => {
    const initialSuggestions = getReplenishingSuggestions([]);
    expect(initialSuggestions.length).toBeGreaterThanOrEqual(16);
    const firstItem = initialSuggestions[0]!;
    const sixteenthItem = initialSuggestions[15]!;

    // User adds the first item to pantry
    const nextSuggestions = getReplenishingSuggestions([firstItem]);

    expect(nextSuggestions).toHaveLength(DEFAULT_SUGGESTION_COUNT);
    expect(nextSuggestions).not.toContain(firstItem);
    // The previous 2nd item is now 1st
    expect(nextSuggestions[0]).toBe(initialSuggestions[1]);
    // The 16th item in next suggestions is a newly revealed candidate (item 17 from master list)
    expect(nextSuggestions[14]).toBe(sixteenthItem);
    expect(nextSuggestions[15]).toBe(RANKED_SUGGESTION_VOCABULARY[16]);
  });

  it('continually replenishes as multiple items are added to the pantry', () => {
    let pantry: string[] = [];

    for (let i = 0; i < 10; i++) {
      const visible = getReplenishingSuggestions(pantry);
      expect(visible).toHaveLength(DEFAULT_SUGGESTION_COUNT);

      // Tap the first suggestion
      const added = visible[0]!;
      expect(pantry).not.toContain(added);
      pantry = [...pantry, added];

      const afterAdd = getReplenishingSuggestions(pantry);
      expect(afterAdd).not.toContain(added);
      expect(afterAdd).toHaveLength(DEFAULT_SUGGESTION_COUNT);
    }
  });

  it('handles pantry provided as a Set as well as an array', () => {
    const fromArray = getReplenishingSuggestions(['egg', 'milk']);
    const fromSet = getReplenishingSuggestions(new Set(['egg', 'milk']));
    expect(fromArray).toEqual(fromSet);
  });

  it('gracefully handles exhaustion when almost all ingredients are in the pantry', () => {
    // Put almost all ingredients in the pantry except 2
    const allExceptTwo = RANKED_SUGGESTION_VOCABULARY.slice(2);
    const suggestions = getReplenishingSuggestions(allExceptTwo);

    expect(suggestions).toEqual(RANKED_SUGGESTION_VOCABULARY.slice(0, 2));

    // Put all ingredients in pantry
    const allIngredients = [...RANKED_SUGGESTION_VOCABULARY];
    const emptySuggestions = getReplenishingSuggestions(allIngredients);
    expect(emptySuggestions).toEqual([]);
  });
});

describe('searchIngredientSuggestions', () => {
  it('filters ingredients matching the search query ignoring case', () => {
    const results = searchIngredientSuggestions('garlic', []);
    expect(results.length).toBeGreaterThan(0);
    for (const id of results) {
      const entry = lookupIngredient(id);
      expect(entry?.displayName.toLowerCase()).toContain('garlic');
    }
  });

  it('excludes owned pantry items from search results', () => {
    const withoutOwned = searchIngredientSuggestions('garlic', []);
    expect(withoutOwned).toContain('garlic');

    const withOwned = searchIngredientSuggestions('garlic', ['garlic']);
    expect(withOwned).not.toContain('garlic');
  });

  it('caps search results at MAX_SEARCH_RESULTS', () => {
    // Single letter search matching many ingredients
    const results = searchIngredientSuggestions('e', []);
    expect(results.length).toBeLessThanOrEqual(MAX_SEARCH_RESULTS);
  });

  it('falls back to replenishing suggestions when query is empty or whitespace', () => {
    const emptyQuery = searchIngredientSuggestions('', ['egg'], DEFAULT_SUGGESTION_COUNT);
    const whitespaceQuery = searchIngredientSuggestions('   ', ['egg'], DEFAULT_SUGGESTION_COUNT);
    const directSuggestions = getReplenishingSuggestions(['egg']);

    expect(emptyQuery).toEqual(directSuggestions);
    expect(whitespaceQuery).toEqual(directSuggestions);
  });

  it('resolves ingredient synonyms such as jelly and pb', () => {
    const jellyResults = searchIngredientSuggestions('jelly', []);
    expect(jellyResults).toContain('jam');
    expect(jellyResults[0]).toBe('jam');

    const pbResults = searchIngredientSuggestions('pb', []);
    expect(pbResults).toContain('peanut_butter');
    expect(pbResults[0]).toBe('peanut_butter');

    const scallionResults = searchIngredientSuggestions('scallions', []);
    expect(scallionResults).toContain('green_onion');
    expect(scallionResults[0]).toBe('green_onion');
  });

  it('returns empty array when search query matches nothing', () => {
    const results = searchIngredientSuggestions('nonexistent_xyz_ingredient_123', []);
    expect(results).toEqual([]);
  });
});

describe('getChecklistIngredientIds', () => {
  it('keeps checked ingredients visible before starter suggestions without a search', () => {
    const ids = getChecklistIngredientIds('', ['milk', 'garlic'], ['rice', 'garlic']);

    expect(ids).toEqual(['milk', 'garlic', 'rice']);
  });

  it('retains a checked ingredient in alias-aware search results', () => {
    const ids = getChecklistIngredientIds('pb', ['peanut_butter'], []);

    expect(ids[0]).toBe('peanut_butter');
    expect(ids).toContain('peanut_butter');
  });

  it('trims search input and returns no invented matches', () => {
    expect(getChecklistIngredientIds('  nonexistent_xyz_ingredient_123  ', ['milk'], [])).toEqual(
      []
    );
  });

  it('respects suggestionLimit for progressive recommendation disclosure', () => {
    const defaultBatch = getChecklistIngredientIds(
      '',
      ['garlic'],
      ['rice', 'salt', 'pasta', 'pepper'],
      24,
      3
    );
    // 1 checked ('garlic') + 3 suggested recommendations
    expect(defaultBatch).toHaveLength(4);
    expect(defaultBatch[0]).toBe('garlic');

    const expandedBatch = getChecklistIngredientIds(
      '',
      ['garlic'],
      ['rice', 'salt', 'pasta', 'pepper'],
      24,
      4
    );
    expect(expandedBatch).toHaveLength(5);
    expect(expandedBatch[0]).toBe('garlic');
  });
});

describe('getPantryRecommendationCandidates', () => {
  it('defines the initial recommendation count as 3 and batch size as 3', () => {
    expect(INITIAL_PANTRY_RECOMMENDATIONS).toBe(3);
    expect(PANTRY_RECOMMENDATION_BATCH_SIZE).toBe(3);
  });

  it('returns unowned candidates with unowned starters prioritized first', () => {
    const candidates = getPantryRecommendationCandidates(['rice']);
    expect(candidates).not.toContain('rice');
    // Common starters like porridge_oats, pasta appear early
    expect(candidates[0]).toBe('porridge_oats');
    expect(candidates[1]).toBe('pasta');
    // Does not contain duplicates
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('continually yields candidates when all starters are owned', () => {
    const candidates = getPantryRecommendationCandidates([
      'rice',
      'porridge_oats',
      'pasta',
      'all_purpose_flour',
      'olive_oil',
      'salt',
      'black_pepper',
    ]);
    expect(candidates.length).toBeGreaterThan(10);
    // Non-starter common pantry items like egg, milk appear
    expect(candidates).toContain('egg');
    expect(candidates).toContain('milk');
  });
});

describe('filterSafeStarterIngredients', () => {
  it('excludes ingredients conflicting with declared allergens', () => {
    const candidateList = ['rice', 'egg', 'milk', 'peanut_butter', 'garlic'];

    // User with peanut and dairy allergy
    const safe = filterSafeStarterIngredients(candidateList, ['peanut', 'dairy'], []);
    expect(safe).toContain('rice');
    expect(safe).toContain('egg');
    expect(safe).toContain('garlic');
    expect(safe).not.toContain('milk');
    expect(safe).not.toContain('peanut_butter');
  });

  it('excludes ingredients conflicting with dietary choices', () => {
    const candidateList = ['rice', 'all_purpose_flour', 'milk', 'egg', 'chicken', 'onion'];

    // Gluten free user
    const glutenFreeSafe = filterSafeStarterIngredients(candidateList, [], ['gluten_free']);
    expect(glutenFreeSafe).not.toContain('all_purpose_flour');
    expect(glutenFreeSafe).toContain('rice');
    expect(glutenFreeSafe).toContain('onion');

    // Dairy free user
    const dairyFreeSafe = filterSafeStarterIngredients(candidateList, [], ['dairy_free']);
    expect(dairyFreeSafe).not.toContain('milk');
    expect(dairyFreeSafe).toContain('egg');

    // Vegetarian user
    const vegetarianSafe = filterSafeStarterIngredients(candidateList, [], ['vegetarian']);
    expect(vegetarianSafe).not.toContain('chicken');
    expect(vegetarianSafe).toContain('egg');
    expect(vegetarianSafe).toContain('milk');

    // Vegan user
    const veganSafe = filterSafeStarterIngredients(candidateList, [], ['vegan']);
    expect(veganSafe).not.toContain('chicken');
    expect(veganSafe).not.toContain('egg');
    expect(veganSafe).not.toContain('milk');
    expect(veganSafe).toContain('rice');
    expect(veganSafe).toContain('onion');
  });

  it('preserves all items when there are no allergens or dietary restrictions', () => {
    const candidateList = ['rice', 'onion', 'garlic', 'tomato'];
    expect(filterSafeStarterIngredients(candidateList, [], [])).toEqual(candidateList);
  });
});
