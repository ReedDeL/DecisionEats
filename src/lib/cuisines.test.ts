import { describe, expect, it } from 'vitest';
import { BUNDLED_CATALOG } from '@/data/catalog';
import { FOOD_GENRE_OPTIONS, foodGenreOptionsForCatalog, normalizeCuisine } from '@/lib/cuisines';
import { formatRelaxation } from '@/lib/format';
import { matchesCuisinePreference } from '@/engine/cuisine-preference';
import { decide } from '@/engine/decide';
import { toEnginePreferences } from '@/store/kitchen';
import { decideWithRelaxation } from '@/engine/relax';

describe('normalizeCuisine', () => {
  it('normalizes common nationality adjectives and country names to canonical slugs', () => {
    expect(normalizeCuisine('American')).toBe('american');
    expect(normalizeCuisine('american')).toBe('american');
    expect(normalizeCuisine('United States')).toBe('american');
    expect(normalizeCuisine('united states')).toBe('american');
    expect(normalizeCuisine('USA')).toBe('american');
    expect(normalizeCuisine('us')).toBe('american');

    expect(normalizeCuisine('British')).toBe('british');
    expect(normalizeCuisine('UK')).toBe('british');
    expect(normalizeCuisine('United Kingdom')).toBe('british');
    expect(normalizeCuisine('English')).toBe('british');

    expect(normalizeCuisine('Chinese')).toBe('chinese');
    expect(normalizeCuisine('China')).toBe('chinese');

    expect(normalizeCuisine('French')).toBe('french');
    expect(normalizeCuisine('France')).toBe('french');

    expect(normalizeCuisine('Indian')).toBe('indian');
    expect(normalizeCuisine('India')).toBe('indian');

    expect(normalizeCuisine('Italian')).toBe('italian');
    expect(normalizeCuisine('Italy')).toBe('italian');

    expect(normalizeCuisine('Spanish')).toBe('spanish');
    expect(normalizeCuisine('Spain')).toBe('spanish');

    expect(normalizeCuisine('Thai')).toBe('thai');
    expect(normalizeCuisine('Thailand')).toBe('thai');

    expect(normalizeCuisine('Mexican')).toBe('mexican');
    expect(normalizeCuisine('Mexico')).toBe('mexican');
  });

  it('handles surrounding whitespace and mixed case', () => {
    expect(normalizeCuisine('   iTaLiAn   ')).toBe('italian');
    expect(normalizeCuisine('  UNITED  STATES  ')).toBe('american');
  });

  it('maps blanks, reserved words, and non-strings to null', () => {
    expect(normalizeCuisine(null)).toBeNull();
    expect(normalizeCuisine(undefined)).toBeNull();
    expect(normalizeCuisine('')).toBeNull();
    expect(normalizeCuisine('    ')).toBeNull();
    expect(normalizeCuisine('any')).toBeNull();
    expect(normalizeCuisine('Any')).toBeNull();
    expect(normalizeCuisine('none')).toBeNull();
    expect(normalizeCuisine('null')).toBeNull();
    expect(normalizeCuisine('unknown')).toBeNull();
    expect(normalizeCuisine(123)).toBeNull();
    expect(normalizeCuisine({})).toBeNull();
  });

  it('preserves unmapped valid cuisines as trimmed lowercase slugs', () => {
    expect(normalizeCuisine('Lebanese')).toBe('lebanese');
    expect(normalizeCuisine('Mediterranean')).toBe('mediterranean');
  });
});

describe('FOOD_GENRE_OPTIONS', () => {
  it('offers broad food styles instead of country-specific chips', () => {
    expect(FOOD_GENRE_OPTIONS).toEqual([
      { value: 'american', label: 'American' },
      { value: 'british', label: 'British' },
      { value: 'chinese', label: 'Chinese' },
      { value: 'japanese', label: 'Japanese' },
      { value: 'korean', label: 'Korean' },
      { value: 'hispanic/latin', label: 'Hispanic/Latin' },
      { value: 'african', label: 'African' },
      { value: 'indian', label: 'Indian' },
      { value: 'mediterranean', label: 'Mediterranean' },
      { value: 'european', label: 'European' },
    ]);
  });

  it('shows new broad styles only after three distinct catalog meals match', () => {
    const meals = [
      { cuisine: 'thai', title: 'Thai curry' },
      { cuisine: 'vietnamese', title: 'Noodle bowl' },
      { cuisine: 'filipino', title: 'Adobo' },
      { cuisine: 'iraqi', title: 'Lentil soup' },
      { cuisine: 'iranian', title: 'Rice dish' },
      { cuisine: 'syrian', title: 'Chickpea salad' },
    ];
    const base = foodGenreOptionsForCatalog(meals.slice(0, 2));
    expect(base.some((option) => option.value === 'southeast_asian')).toBe(false);

    const expanded = foodGenreOptionsForCatalog(meals);
    expect(expanded).toContainEqual({ value: 'southeast_asian', label: 'Southeast Asian' });
    expect(expanded).toContainEqual({ value: 'middle_eastern', label: 'Middle Eastern' });
    expect(new Set(expanded.map((option) => option.value)).size).toBe(expanded.length);
    expect(new Set(expanded.map((option) => option.label)).size).toBe(expanded.length);
    expect(
      expanded.filter((option) => ['chinese', 'japanese', 'korean'].includes(option.value))
    ).toHaveLength(3);
  });

  it('does not add a style that only repeats meals from existing choices', () => {
    const meals = [
      { cuisine: 'lebanese', title: 'Lentil soup' },
      { cuisine: 'lebanese', title: 'Flatbread' },
      { cuisine: 'iranian', title: 'Rice dish' },
    ];
    expect(
      foodGenreOptionsForCatalog(meals).some((option) => option.value === 'middle_eastern')
    ).toBe(false);
  });

  it('does not count title variations as distinct meals', () => {
    const meals = [
      { cuisine: 'thai', title: 'Thai curry' },
      { cuisine: 'thai', title: ' thai curry ' },
      { cuisine: 'vietnamese', title: 'Noodle bowl' },
    ];
    expect(
      foodGenreOptionsForCatalog(meals).some((option) => option.value === 'southeast_asian')
    ).toBe(false);
  });
});

describe('cuisine preference and engine relaxation ladder', () => {
  it('explains when the selected style cannot be honored', () => {
    expect(formatRelaxation({ kind: 'cuisine_dropped', cuisine: 'chinese' })).toBe(
      'No Chinese meals fit right now. Showing other food styles that fit your kitchen.'
    );
    expect(formatRelaxation({ kind: 'cuisine_dropped', cuisine: 'middle_eastern' })).toBe(
      'No Middle Eastern meals fit right now. Showing other food styles that fit your kitchen.'
    );
  });

  it('matches regional dishes inside their broad food styles', () => {
    expect(matchesCuisinePreference('nigerian', 'african')).toBe(true);
    expect(matchesCuisinePreference('kenyan', 'african')).toBe(true);
    expect(matchesCuisinePreference('mexican', 'hispanic/latin')).toBe(true);
    expect(matchesCuisinePreference('spanish', 'hispanic/latin')).toBe(true);
    expect(matchesCuisinePreference('chinese', 'asian')).toBe(true);
    expect(matchesCuisinePreference('indian', 'asian')).toBe(false);
    expect(matchesCuisinePreference('italian', 'mediterranean')).toBe(true);
    expect(matchesCuisinePreference('russian', 'european')).toBe(true);
    expect(matchesCuisinePreference('nigerian', 'italian')).toBe(false);
  });

  it('keeps unclassified recipes out of selected genres and preserves Any', () => {
    expect(matchesCuisinePreference(null, 'asian')).toBe(false);
    expect(matchesCuisinePreference(null, null)).toBe(true);
  });

  const pantry = new Set([
    'bread',
    'peanut_butter',
    'jam',
    'cheddar_cheese',
    'butter',
    'spaghetti',
    'tomato',
    'garlic',
    'olive_oil',
    'salt',
    'porridge_oats',
    'milk',
    'honey',
    'lentils',
    'water',
    'vegetable_stock',
    'cumin',
    'rice',
    'stir_fry_vegetables',
    'soy_sauce',
    'sesame_seed_oil',
  ]);

  it('returns exact cuisine matches in strict mode when candidates exist', () => {
    const prefs = toEnginePreferences(
      {
        equipment: ['microwave', 'stove'],
        allergens: [],
        dietary: [],
        dislikedRecipes: [],
        skippedRecipes: [],
      },
      'italian'
    );

    const result = decide(BUNDLED_CATALOG, pantry, prefs, 30);
    const totalResults = Object.values(result.buckets).flat();
    expect(totalResults.length).toBeGreaterThan(0);
    expect(totalResults.every((s) => s.recipe.cuisine === 'italian')).toBe(true);
  });

  it('relaxes cuisine when needed without relaxing hard constraints', () => {
    // Requesting a cuisine with no 5-minute stove recipe
    const prefs = toEnginePreferences(
      {
        equipment: ['microwave'],
        allergens: ['dairy'],
        dietary: [],
        dislikedRecipes: [],
        skippedRecipes: [],
      },
      'italian'
    );

    // Microwave pizza has mozzarella (dairy), so no italian recipe is dairy-safe
    const result = decideWithRelaxation(BUNDLED_CATALOG, pantry, prefs, 15);
    const allSuggestions = Object.values(result.buckets).flat();
    // Recommendations returned via relaxation
    expect(allSuggestions.length).toBeGreaterThan(0);
    // Hard constraint (dairy allergen) was NEVER relaxed
    for (const suggestion of allSuggestions) {
      const allergens = suggestion.recipe.ingredients.flatMap((i) => i.allergenGroups);
      expect(allergens).not.toContain('dairy');
    }
    // Stated relaxation includes dropped cuisine
    expect(result.appliedRelaxations.some((r) => r.kind === 'cuisine_dropped')).toBe(true);
  });
});
