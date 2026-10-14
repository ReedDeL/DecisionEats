import { BUNDLED_CATALOG } from '@/data/catalog';
import { matchesCuisinePreference } from '@/engine/cuisine-preference';
import type { Recipe } from '@/engine/types';
import { normalizeCuisine } from '@/lib/adapters/to-recipe';

export interface FoodGenreOption {
  /** The engine preference id for this broad food style. */
  value: string;
  /** What the user reads. */
  label: string;
}

export { normalizeCuisine };

/**
 * Existing choices stay available, including the explicitly requested Chinese,
 * Japanese, and Korean styles. The relaxation flow explains unavailable matches.
 */
const BASE_FOOD_GENRE_OPTIONS: readonly FoodGenreOption[] = [
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
];

/** Broad additions appear only when the catalog has several distinct meals. */
const CATALOG_GATED_OPTIONS: readonly FoodGenreOption[] = [
  { value: 'southeast_asian', label: 'Southeast Asian' },
  { value: 'middle_eastern', label: 'Middle Eastern' },
];

const MIN_DISTINCT_MEALS = 3;

export function foodGenreOptionsForCatalog(
  catalog: readonly Pick<Recipe, 'cuisine' | 'title'>[]
): readonly FoodGenreOption[] {
  const options = [...BASE_FOOD_GENRE_OPTIONS];

  for (const option of CATALOG_GATED_OPTIONS) {
    if (
      options.some((existing) => existing.value === option.value || existing.label === option.label)
    ) {
      continue;
    }

    const matchingMeals = new Set(
      catalog
        .filter(
          (recipe) =>
            matchesCuisinePreference(recipe.cuisine, option.value) &&
            !BASE_FOOD_GENRE_OPTIONS.some((existing) =>
              matchesCuisinePreference(recipe.cuisine, existing.value)
            )
        )
        .map((recipe) => recipe.title.trim().toLowerCase())
        .filter(Boolean)
    );
    if (matchingMeals.size >= MIN_DISTINCT_MEALS) options.push(option);
  }

  return options;
}

export const FOOD_GENRE_OPTIONS = foodGenreOptionsForCatalog(BUNDLED_CATALOG);
