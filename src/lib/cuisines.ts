import { normalizeCuisine } from '@/lib/adapters/to-recipe';

export interface FoodGenreOption {
  /** The engine preference id for this broad food style. */
  value: string;
  /** What the user reads. */
  label: string;
}

export { normalizeCuisine };

/**
 * Optional broad food styles for the Now journey. A genre may not have a
 * matching recipe in the current catalog; the normal relaxation flow explains
 * when it has to show other meals.
 */
export const FOOD_GENRE_OPTIONS: readonly FoodGenreOption[] = [
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
