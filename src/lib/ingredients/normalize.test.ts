import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  LEADING_MODIFIERS,
  SYNONYMS,
  canonicalSlug,
  singularize,
  slugify,
} from '@/lib/ingredients/normalize';

describe('slugify', () => {
  it('lowercases and collapses punctuation to underscores', () => {
    expect(slugify('All-Purpose Flour')).toBe('all_purpose_flour');
    expect(slugify('  Olive Oil  ')).toBe('olive_oil');
  });

  it('strips accents rather than dropping the character', () => {
    expect(slugify('jalapeño')).toBe('jalapeno');
    expect(slugify('crème fraîche')).toBe('creme_fraiche');
  });

  it('returns an empty string for input with no letters', () => {
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
  });
});

describe('canonicalSlug', () => {
  it('preserves cooked-food and whole-grain identity after cosmetic modifiers', () => {
    expect(canonicalSlug('fresh cooked chicken')).toBe('cooked_chicken');
    expect(canonicalSlug('whole wheat flour')).toBe('whole_wheat_flour');
    expect(canonicalSlug('ground turkey')).toBe('ground_turkey');
  });
  it('strips leading modifiers', () => {
    expect(canonicalSlug('fresh chopped garlic')).toBe('garlic');
    expect(canonicalSlug('finely diced onion')).toBe('onion');
  });

  it('keeps a modifier that is the entire name', () => {
    // "ground" alone is not an ingredient, but stripping it to nothing would
    // silently discard the item instead of surfacing it for correction.
    expect(canonicalSlug('ground')).toBe('ground');
  });

  it('applies synonyms', () => {
    expect(canonicalSlug('scallions')).toBe('green_onion');
    expect(canonicalSlug('aubergine')).toBe('eggplant');
  });

  it('resolves a synonym chain without looping', () => {
    // plain_flour -> all_purpose_flour, and all_purpose_flour is terminal.
    expect(canonicalSlug('plain flour')).toBe('all_purpose_flour');
  });

  it('strips modifiers before applying synonyms', () => {
    expect(canonicalSlug('fresh spring onions')).toBe('green_onion');
  });

  it('returns empty for input carrying no ingredient', () => {
    expect(canonicalSlug('')).toBe('');
    expect(canonicalSlug('   ')).toBe('');
  });
});

describe('singularize', () => {
  it('offers candidates for common plural forms', () => {
    expect(singularize('berries')).toContain('berry');
    expect(singularize('tomatoes')).toContain('tomato');
    expect(singularize('onions')).toContain('onion');
  });

  it('leaves double-s words alone', () => {
    expect(singularize('grass')).toEqual([]);
  });
});

/**
 * The Python pipeline mints the ids in src/data/ingredients.json and this
 * module resolves onto them. A table that exists in one and not the other is
 * the exact silent-drift failure tools/catalog/normalize.py warns about, so it
 * is asserted rather than trusted to review.
 */
describe('parity with tools/catalog/normalize.py', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../../tools/catalog/normalize.py', import.meta.url)),
    'utf8'
  );

  it('declares the same synonyms', () => {
    expect(extractPythonMapping(source, 'SYNONYMS')).toEqual(SYNONYMS);
  });

  it('declares the same leading modifiers', () => {
    expect(extractPythonStringSet(source, '_LEADING_MODIFIERS')).toEqual(
      [...LEADING_MODIFIERS].sort()
    );
  });
});

/** Pulls `"key": "value",` pairs out of a Python dict literal. */
function extractPythonMapping(source: string, name: string): Record<string, string> {
  const block = blockAfter(source, name);
  const mapping: Record<string, string> = {};
  for (const [, key, value] of block.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
    mapping[key!] = value!;
  }
  return mapping;
}

/** Pulls `"value",` entries out of a Python set literal. */
function extractPythonStringSet(source: string, name: string): string[] {
  const block = blockAfter(source, name);
  return [...block.matchAll(/"([^"]+)"/g)].map(([, value]) => value!).sort();
}

function blockAfter(source: string, name: string): string {
  const start = source.indexOf(name);
  expect(start, `${name} not found in normalize.py`).toBeGreaterThan(-1);
  const end =
    source.indexOf('\n)', start) === -1
      ? source.indexOf('\n}', start)
      : source.indexOf('\n)', start);
  const closing = source.indexOf('\n}', start);
  const stop = [end, closing].filter((index) => index > start).sort((a, b) => a - b)[0];
  return source.slice(start, stop === undefined ? undefined : stop);
}
