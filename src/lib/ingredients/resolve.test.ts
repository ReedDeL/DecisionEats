import { describe, expect, it } from 'vitest';

import { INGREDIENT_VOCABULARY } from '@/data/catalog';
import { SYNONYMS, canonicalSlug } from '@/lib/ingredients/normalize';
import {
  isTrustedMatch,
  levenshtein,
  ratio,
  resolveIngredient,
  searchVocabulary,
} from '@/lib/ingredients/resolve';

describe('resolveIngredient', () => {
  it('matches a name that is already canonical', () => {
    const result = resolveIngredient('milk');
    expect(result.id).toBe('milk');
    expect(result.match).toBe('exact');
  });

  it('matches case-insensitively', () => {
    expect(resolveIngredient('GOCHUJANG').id).toBe('gochujang');
  });

  it('matches through accents', () => {
    expect(resolveIngredient('jalapeño').id).toBe('jalapeno');
  });

  it('reports a synonym rewrite as a synonym, not an exact hit', () => {
    const result = resolveIngredient('scallions');
    expect(result.id).toBe('green_onion');
    expect(result.match).toBe('synonym');
  });

  it('strips a leading modifier', () => {
    expect(resolveIngredient('freshly chopped garlic').id).toBe('garlic');
  });

  it('drops qualifier words the vocabulary does not carry', () => {
    // The exact case the vision model produces constantly.
    expect(resolveIngredient('baby spinach').id).toBe('spinach');
    expect(resolveIngredient('large red onion').id).toBe('red_onions');
    expect(resolveIngredient('Tyson Chicken Breast 3lb').id).toBe('chicken_breast');
  });

  it('prefers the longest qualifier-stripped match', () => {
    // "chicken breast", not "chicken" or "breast".
    const result = resolveIngredient('boneless skinless chicken breast');
    expect(result.id).toBe('chicken_breast');
  });

  it('never reports a qualifier-stripped match as trusted', () => {
    // Unrecognized product qualifiers still require confirmation.
    const result = resolveIngredient('barista oat milk');
    expect(result.match).toBe('partial');
    expect(isTrustedMatch(result.match)).toBe(false);
  });

  it('returns unmatched rather than guessing for something absent', () => {
    const result = resolveIngredient('leftover pizza');
    expect(result.id).toBeNull();
    expect(result.match).toBe('unmatched');
  });

  it('returns unmatched for input carrying no ingredient', () => {
    expect(resolveIngredient('').match).toBe('unmatched');
    expect(resolveIngredient('   ').match).toBe('unmatched');
    expect(resolveIngredient('!!!').match).toBe('unmatched');
  });

  it('keeps the raw name so the user can see what was changed', () => {
    expect(resolveIngredient('Scallions').raw).toBe('Scallions');
  });

  it('only ever returns ids that exist in the vocabulary', () => {
    const known = new Set(INGREDIENT_VOCABULARY.map((entry) => entry.id));
    const probes = [
      'milk',
      'scallions',
      'baby spinach',
      'capsicum',
      'beef mince',
      'oat milk',
      'roma tomato',
      'half a loaf of bread',
      'gochujang',
      'leftover pizza',
    ];

    for (const probe of probes) {
      const { id } = resolveIngredient(probe);
      if (id !== null) expect(known, `${probe} resolved to unknown id ${id}`).toContain(id);
    }
  });
});

/**
 * The synonym table is shared with tools/catalog/normalize.py, and two of its
 * targets name ids the catalog does not mint. That is a defect in the shared
 * table, not in the resolver — but the resolver must degrade rather than
 * dead-end, so the behaviour is pinned here. Retarget the synonyms and these
 * become ordinary matches.
 */
describe('synonym targets missing from the vocabulary', () => {
  const known = new Set(INGREDIENT_VOCABULARY.map((entry) => entry.id));

  it('is still limited to the remaining known case', () => {
    const missing = [...new Set(Object.values(SYNONYMS))].filter((id) => !known.has(id)).sort();
    expect(missing).toEqual(['ground_beef']);
  });

  it('falls through to a usable match instead of vanishing', () => {
    // canonicalSlug sends this to an id that does not exist...
    expect(canonicalSlug('beef mince')).toBe('ground_beef');
    expect(known.has('ground_beef')).toBe(false);

    // ...and the resolver still finds something for the user to confirm.
    const result = resolveIngredient('beef mince');
    expect(result.id).toBe('beef');
    expect(isTrustedMatch(result.match)).toBe(false);
  });
});

/**
 * The vocabulary ships singular and plural spellings of the same ingredient as
 * separate ids, and recipes reference both. Pinned here so the set cannot grow
 * unnoticed — every new pair is another way for a stocked pantry to miss a
 * recipe it should match.
 */
describe('duplicate singular/plural ids in the vocabulary', () => {
  const ids = new Set(INGREDIENT_VOCABULARY.map((entry) => entry.id));

  it('is still limited to the known pairs', () => {
    const pairs: string[] = [];

    for (const id of [...ids].sort()) {
      const singulars = [
        id.endsWith('ies') ? `${id.slice(0, -3)}y` : null,
        id.endsWith('es') ? id.slice(0, -2) : null,
        id.endsWith('s') && !id.endsWith('ss') ? id.slice(0, -1) : null,
      ].filter((value): value is string => value !== null);

      if (singulars.some((singular) => ids.has(singular))) pairs.push(id);
    }

    expect(pairs.sort()).toEqual([
      'buns',
      'carrots',
      'chestnuts',
      'chicken_breasts',
      'chives',
      'cloves',
      'eggs',
      'lemons',
      'onions',
      'pistachios',
      'tomatoes',
    ]);
  });

  it('resolves both spellings of a merged pair to one id', () => {
    expect(resolveIngredient('onion').id).toBe(resolveIngredient('onions').id);
    expect(resolveIngredient('egg').id).toBe(resolveIngredient('eggs').id);
    expect(resolveIngredient('tomato').id).toBe(resolveIngredient('tomatoes').id);
  });

  it('keeps clove and cloves apart', () => {
    // The spice and the garlic unit are different ingredients; merging them
    // would be confidently wrong.
    expect(resolveIngredient('clove').id).not.toBe(resolveIngredient('cloves').id);
  });
});

describe('searchVocabulary', () => {
  it('ranks prefix matches above substring matches', () => {
    const results = searchVocabulary('onion');
    expect(results[0]?.displayName.startsWith('onion')).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(searchVocabulary('  ')).toEqual([]);
  });

  it('finds synonym targets such as jelly resolving to jam', () => {
    const results = searchVocabulary('jelly');
    expect(results.map((e) => e.id)).toContain('jam');
  });

  it('respects the limit', () => {
    expect(searchVocabulary('a', 5).length).toBeLessThanOrEqual(5);
  });
});

describe('levenshtein', () => {
  it('is zero for identical strings', () => {
    expect(levenshtein('milk', 'milk')).toBe(0);
  });

  it('counts single edits', () => {
    expect(levenshtein('milk', 'silk')).toBe(1);
    expect(levenshtein('milk', 'mil')).toBe(1);
    expect(levenshtein('mil', 'milk')).toBe(1);
  });

  it('handles an empty operand', () => {
    expect(levenshtein('', 'milk')).toBe(4);
    expect(levenshtein('milk', '')).toBe(4);
  });

  it('produces a ratio in [0, 1]', () => {
    expect(ratio('milk', 'milk')).toBe(1);
    expect(ratio('', '')).toBe(1);
    expect(ratio('milk', 'xxxx')).toBe(0);
  });
});
