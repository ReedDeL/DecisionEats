import { INGREDIENT_VOCABULARY, lookupIngredient, type VocabularyEntry } from '@/data/catalog';
import type { IngredientId } from '@/engine/types';
import { canonicalSlug, singularize, slugify } from '@/lib/ingredients/normalize';

/**
 * How a free-text name was matched to the canonical vocabulary. The UI treats
 * these differently: an exact match can be accepted quietly, a fuzzy one is
 * shown for confirmation, and an unmatched one demands a decision.
 */
export type MatchKind = 'exact' | 'synonym' | 'plural' | 'partial' | 'fuzzy' | 'unmatched';

/**
 * Match kinds the app is willing to accept without the user looking at them.
 *
 * Everything else lands in the confirmation sheet pre-flagged. `partial` is
 * excluded on purpose: dropping a qualifier turns "oat milk" into "milk",
 * which is plausible, wrong, and exactly the kind of error that poisons the
 * pantry set difference the engine depends on.
 */
const TRUSTED_MATCHES: ReadonlySet<MatchKind> = new Set<MatchKind>(['exact', 'synonym', 'plural']);

export function isTrustedMatch(match: MatchKind): boolean {
  return TRUSTED_MATCHES.has(match);
}

export interface ResolvedIngredient {
  /** Exactly what the model said, kept so the user can see what was corrected. */
  raw: string;
  id: IngredientId | null;
  displayName: string | null;
  match: MatchKind;
  /** 1 for a certain match, lower for fuzzy. 0 when unmatched. */
  similarity: number;
}

/**
 * Below this, a fuzzy candidate is not offered at all. Chosen so that
 * "cheddar" reaches "cheddar cheese" but "chorizo" does not reach "chorizo
 * sausage" by accident — an ingredient the user never had is worse than one
 * they have to add by hand, because the pantry is what the whole engine
 * trusts.
 */
const FUZZY_THRESHOLD = 0.8;

/** Short strings produce meaningless edit-distance ratios. */
const MIN_FUZZY_LENGTH = 4;

/**
 * The generated vocabulary contains singular and plural spellings of the same
 * ingredient as *separate ids*, and recipes use both — `egg` in 121 recipes,
 * `eggs` in 106. That is a defect in the catalog pipeline, not here, and the
 * real fix is to collapse plurals in `tools/catalog/normalize.py` and
 * regenerate.
 *
 * Until that happens, this map at least stops the photo pipeline making it
 * worse by scattering pantry entries across both spellings. Each pair resolves
 * to whichever form more recipes actually use, so the pantry matches as much
 * of the catalog as possible.
 *
 * `clove`/`cloves` is excluded deliberately: they are not the same ingredient.
 * One is the spice, the other is how recipes count garlic. Merging them would
 * be confidently wrong, which is worse than leaving a duplicate.
 */
const DUPLICATE_SPELLINGS: Readonly<Record<string, string>> = {
  buns: 'bun',
  carrot: 'carrots',
  chestnuts: 'chestnut',
  chicken_breasts: 'chicken_breast',
  chive: 'chives',
  eggs: 'egg',
  lemons: 'lemon',
  onions: 'onion',
  pistachios: 'pistachio',
  tomatoes: 'tomato',
};

interface IndexEntry {
  entry: VocabularyEntry;
  slug: string;
}

/**
 * Built once. `displayName` and `id` are both indexed because the vision model
 * returns prose ("green onion") while the vocabulary keys on slugs
 * ("green_onion").
 */
const INDEX: readonly IndexEntry[] = INGREDIENT_VOCABULARY.map((entry) => ({
  entry,
  slug: slugify(entry.displayName),
}));

const BY_SLUG = new Map<string, VocabularyEntry>();
for (const { entry, slug } of INDEX) {
  BY_SLUG.set(entry.id, preferred(entry));
  if (!BY_SLUG.has(slug)) BY_SLUG.set(slug, preferred(entry));
}

/** Redirect a duplicate spelling onto the form the catalog mostly uses. */
function preferred(entry: VocabularyEntry): VocabularyEntry {
  const target = DUPLICATE_SPELLINGS[entry.id];
  if (target === undefined) return entry;
  return lookupIngredient(target) ?? entry;
}

/**
 * Resolve one free-text ingredient name onto the canonical vocabulary.
 *
 * The tiers run cheapest-first and stop at the first hit. Every tier below
 * `exact` is reported honestly rather than collapsed, because the confirmation
 * sheet's whole job is to show the user what the machine was unsure about.
 */
export function resolveIngredient(rawName: string): ResolvedIngredient {
  const raw = rawName.trim();
  const unmatched: ResolvedIngredient = {
    raw,
    id: null,
    displayName: null,
    match: 'unmatched',
    similarity: 0,
  };

  if (raw.length === 0) return unmatched;

  const literal = slugify(raw);
  const canonical = canonicalSlug(raw);
  if (!canonical) return unmatched;

  // A synonym or a stripped modifier changed the string, so report the match
  // as derived rather than exact even when the lookup itself is direct.
  const wasRewritten = canonical !== literal;

  const direct = BY_SLUG.get(canonical) ?? BY_SLUG.get(literal);
  if (direct) {
    return {
      raw,
      id: direct.id,
      displayName: direct.displayName,
      match: wasRewritten ? 'synonym' : 'exact',
      similarity: 1,
    };
  }

  /**
   * Both spellings are carried into the remaining tiers. The synonym table is
   * shared with the catalog pipeline and two of its targets (`bell_pepper`,
   * `ground_beef`) name ids the catalog never actually mints — so a rewrite can
   * move a resolvable name onto a dead id. Keeping the pre-rewrite slug means
   * that degrades to a flagged partial match instead of vanishing.
   */
  const candidates = canonical === literal ? [canonical] : [canonical, literal];

  for (const candidate of candidates) {
    for (const singular of singularize(candidate)) {
      const hit = BY_SLUG.get(singular);
      if (hit) {
        return { raw, id: hit.id, displayName: hit.displayName, match: 'plural', similarity: 1 };
      }
    }
  }

  for (const candidate of candidates) {
    const partial = bestPartialMatch(candidate);
    if (partial) return { raw, ...partial };
  }

  const fuzzy = candidates.map(bestFuzzyMatch).find(Boolean) ?? null;
  if (fuzzy) {
    return {
      raw,
      id: fuzzy.entry.id,
      displayName: fuzzy.entry.displayName,
      match: 'fuzzy',
      similarity: fuzzy.similarity,
    };
  }

  return unmatched;
}

interface FuzzyHit {
  entry: VocabularyEntry;
  similarity: number;
}

/**
 * Match by dropping qualifier words the vocabulary does not carry.
 *
 * A recipe says "onion"; a photo says "large red onion", "baby spinach",
 * "frozen edamame", "Tyson Chicken Breast 3lb". The fixed modifier list in
 * `normalize.ts` cannot cover that tail — it is open-ended and brand names are
 * in it — so every contiguous run of words is tried against the vocabulary,
 * longest first, and the longest exact hit wins.
 *
 * This is the least certain tier that still produces a real id, so it is
 * reported as `partial` and never auto-accepted. Similarity is the fraction of
 * the original words that survived, which is what the sheet shows the user as
 * "we dropped some words here".
 */
function bestPartialMatch(
  slug: string
): { id: IngredientId; displayName: string; match: MatchKind; similarity: number } | null {
  const tokens = slug.split('_').filter(Boolean);
  if (tokens.length < 2) return null;

  for (let length = tokens.length - 1; length >= 1; length -= 1) {
    for (let start = 0; start + length <= tokens.length; start += 1) {
      const window = tokens.slice(start, start + length).join('_');
      const hit =
        BY_SLUG.get(window) ??
        singularize(window)
          .map((s) => BY_SLUG.get(s))
          .find(Boolean);

      if (hit) {
        return {
          id: hit.id,
          displayName: hit.displayName,
          match: 'partial',
          similarity: length / tokens.length,
        };
      }
    }
  }

  return null;
}

function bestFuzzyMatch(slug: string): FuzzyHit | null {
  if (slug.length < MIN_FUZZY_LENGTH) return null;

  let best: FuzzyHit | null = null;

  for (const { entry, slug: candidate } of INDEX) {
    const similarity = Math.max(
      ratio(slug, entry.id),
      candidate === entry.id ? 0 : ratio(slug, candidate)
    );

    if (similarity >= FUZZY_THRESHOLD && (best === null || similarity > best.similarity)) {
      best = { entry, similarity };
    }
  }

  return best;
}

/** Normalized similarity in [0, 1]: 1 - editDistance / longerLength. */
export function ratio(a: string, b: string): number {
  if (a === b) return 1;
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 1;
  return 1 - levenshtein(a, b) / longer;
}

/**
 * Two-row Levenshtein. The full matrix is unnecessary here — only the distance
 * is wanted, never the alignment — and 897 comparisons per name run in well
 * under a millisecond.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution);
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length]!;
}

/**
 * Vocabulary search for the correction UI. Prefix matches rank above
 * substring matches, because someone typing "on" means onion far more often
 * than they mean bacon.
 */
export function searchVocabulary(query: string, limit = 20): readonly VocabularyEntry[] {
  const term = query.trim().toLowerCase();
  if (term.length === 0) return [];

  const results: VocabularyEntry[] = [];
  const seen = new Set<string>();

  const add = (entry: VocabularyEntry | undefined) => {
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      results.push(entry);
    }
  };

  // 1. Direct resolved / synonym match
  const resolved = resolveIngredient(term);
  if (resolved.id) {
    add(lookupIngredient(resolved.id));
  }

  // 2. Prefix matches
  for (const entry of INGREDIENT_VOCABULARY) {
    const name = entry.displayName.toLowerCase();
    if (name.startsWith(term)) {
      add(entry);
      if (results.length >= limit) return results;
    }
  }

  // 3. Substring matches
  for (const entry of INGREDIENT_VOCABULARY) {
    const name = entry.displayName.toLowerCase();
    if (name.includes(term)) {
      add(entry);
      if (results.length >= limit) return results;
    }
  }

  return results.slice(0, limit);
}

/** True when the id exists in the bundled vocabulary. */
export function isKnownIngredient(id: string): boolean {
  return lookupIngredient(id) !== undefined;
}
