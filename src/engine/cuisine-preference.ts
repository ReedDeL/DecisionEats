/**
 * Broad food-style preferences map to canonical cuisine values at the engine
 * boundary. This keeps the UI inclusive while recipes retain their source tags.
 */
const GENRE_CUISINES: Readonly<Record<string, readonly string[]>> = {
  american: ['american', 'canadian'],
  british: ['british', 'english', 'scottish', 'welsh'],
  asian: [
    'bangladeshi',
    'chinese',
    'filipino',
    'indonesian',
    'japanese',
    'korean',
    'malaysian',
    'pakistani',
    'singaporean',
    'sri_lankan',
    'thai',
    'vietnamese',
  ],
  'hispanic/latin': [
    'argentinian',
    'brazilian',
    'chilean',
    'colombian',
    'cuban',
    'mexican',
    'peruvian',
    'spanish',
  ],
  african: ['egyptian', 'ethiopian', 'kenyan', 'moroccan', 'nigerian', 'south_african', 'tunisian'],
  indian: ['indian'],
  mediterranean: ['greek', 'italian', 'lebanese', 'moroccan', 'spanish', 'turkish'],
  european: [
    'british',
    'croatian',
    'french',
    'german',
    'greek',
    'irish',
    'italian',
    'polish',
    'portuguese',
    'russian',
    'spanish',
    'swedish',
  ],
};

/** Matches a recipe to a broad genre, while preserving legacy exact cuisine values. */
export function matchesCuisinePreference(
  recipeCuisine: string | null,
  preference: string | null
): boolean {
  if (preference === null) return true;
  if (recipeCuisine === null) return false;

  const cuisines = GENRE_CUISINES[preference];
  return cuisines ? cuisines.includes(recipeCuisine) : recipeCuisine === preference;
}
