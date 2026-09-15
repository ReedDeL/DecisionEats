/**
 * Canonical ingredient identity for free-text names.
 *
 * This is the TypeScript counterpart to `tools/catalog/normalize.py`, and the
 * two must agree. The catalog pipeline uses the Python version to mint the ids
 * in `src/data/ingredients.json`; this one resolves whatever the vision model
 * calls an ingredient onto those same ids. If they drift, the photo pipeline
 * writes ids the engine's pantry lookup will never match, and every
 * recommendation is quietly wrong in a way no engine test would catch.
 * `normalize.test.ts` asserts the shared tables stay identical.
 */

/**
 * Surface forms that mean the same ingredient. Deliberately conservative:
 * merging two genuinely different ingredients is worse than leaving a
 * near-duplicate, because it produces confidently wrong recommendations.
 *
 * Mirrors SYNONYMS in tools/catalog/normalize.py.
 */
export const SYNONYMS: Readonly<Record<string, string>> = {
  carrot: 'carrots',
  eggs: 'egg',
  chicken_breasts: 'chicken_breast',
  onions: 'onion',
  lemons: 'lemon',
  buns: 'bun',
  chestnuts: 'chestnut',
  chive: 'chives',
  pistachios: 'pistachio',
  apple: 'apples',
  dried_apricot: 'dried_apricots',
  egg_yolk: 'egg_yolks',
  red_onion: 'red_onions',
  sweet_potato: 'sweet_potatoes',
  turnip: 'turnips',
  tomatoes: 'tomato',
  scallion: 'green_onion',
  scallions: 'green_onion',
  spring_onion: 'green_onion',
  spring_onions: 'green_onion',
  green_onions: 'green_onion',
  coriander_leaves: 'cilantro',
  fresh_coriander: 'cilantro',
  aubergine: 'eggplant',
  courgette: 'zucchini',
  capsicum: 'bell_pepper',
  bell_peppers: 'bell_pepper',
  garbanzo_beans: 'chickpeas',
  chick_peas: 'chickpeas',
  plain_flour: 'all_purpose_flour',
  flour: 'all_purpose_flour',
  castor_sugar: 'caster_sugar',
  confectioners_sugar: 'powdered_sugar',
  icing_sugar: 'powdered_sugar',
  double_cream: 'heavy_cream',
  heavy_whipping_cream: 'heavy_cream',
  minced_beef: 'ground_beef',
  beef_mince: 'ground_beef',
  prawns: 'shrimp',
  prawn: 'shrimp',
  jelly: 'jam',
  jellies: 'jam',
  peanut: 'peanuts',
  peanutbutter: 'peanut_butter',
  pb: 'peanut_butter',
  potato: 'potatoes',
};

/**
 * Descriptors that qualify an ingredient without changing what it is, so
 * "fresh chopped garlic" and "garlic" resolve together.
 *
 * Mirrors _LEADING_MODIFIERS in tools/catalog/normalize.py.
 */
export const LEADING_MODIFIERS: ReadonlySet<string> = new Set([
  'fresh',
  'freshly',
  'finely',
  'roughly',
  'coarsely',
  'chopped',
  'minced',
  'diced',
  'sliced',
  'grated',
  'shredded',
  'crushed',
  'ground',
  'whole',
  'large',
  'small',
  'medium',
  'hot',
  'cold',
  'warm',
  'raw',
  'cooked',
]);

const NON_ALNUM = /[^a-z0-9]+/g;

/** Lowercase, strip accents, and collapse everything else to underscores. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(NON_ALNUM, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Resolve a free-text name to a canonical slug, without consulting the
 * vocabulary. Returns `''` for input carrying no ingredient at all, so callers
 * can drop it rather than inventing an empty id.
 */
export function canonicalSlug(rawName: string): string {
  let slug = slugify(rawName);
  if (!slug) return '';
  // Preparation and whole-grain identity change what the user can cook.
  const preserved = [
    'cooked_rice',
    'cooked_brown_rice',
    'cooked_chicken',
    'cooked_ham',
    'whole_wheat_flour',
    'whole_wheat_spaghetti',
    'ground_turkey',
  ];
  if (preserved.includes(slug)) return slug;

  let parts = slug.split('_');
  while (parts.length > 1 && LEADING_MODIFIERS.has(parts[0]!)) {
    if (preserved.includes(parts.join('_'))) break;
    parts = parts.slice(1);
  }
  slug = parts.join('_');

  // Apply synonyms repeatedly so chains resolve, but never loop forever.
  const seen = new Set<string>();
  while (SYNONYMS[slug] !== undefined && !seen.has(slug)) {
    seen.add(slug);
    slug = SYNONYMS[slug]!;
  }

  return slug;
}

/**
 * English plural forms, narrowly. This only ever runs as a fallback after an
 * exact lookup has already failed, so a wrong guess costs a fuzzy match rather
 * than a wrong ingredient.
 */
export function singularize(slug: string): string[] {
  const candidates: string[] = [];
  if (slug.endsWith('ies') && slug.length > 4) candidates.push(`${slug.slice(0, -3)}y`);
  if (slug.endsWith('oes') && slug.length > 4) candidates.push(slug.slice(0, -2));
  if (slug.endsWith('es') && slug.length > 3) candidates.push(slug.slice(0, -2));
  if (slug.endsWith('s') && !slug.endsWith('ss') && slug.length > 2) {
    candidates.push(slug.slice(0, -1));
  }
  return candidates;
}
