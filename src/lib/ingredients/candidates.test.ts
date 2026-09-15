import { describe, expect, it } from 'vitest';

import {
  CONFIDENCE_THRESHOLD,
  acceptedIngredientIds,
  correctCandidate,
  toCandidates,
  type DetectedItem,
} from '@/lib/ingredients/candidates';

function detected(overrides: Partial<DetectedItem> & Pick<DetectedItem, 'name'>): DetectedItem {
  return { quantity: 1, unit: 'pieces', confidence: 0.95, ...overrides };
}

describe('toCandidates', () => {
  it('normalizes a detected name onto a canonical id', () => {
    const [candidate] = toCandidates([detected({ name: 'Scallions' })]);

    expect(candidate?.ingredientId).toBe('green_onion');
    expect(candidate?.detectedName).toBe('Scallions');
  });

  it('pre-accepts a confident, cleanly matched item', () => {
    const [candidate] = toCandidates([detected({ name: 'milk', confidence: 0.95 })]);
    expect(candidate?.accepted).toBe(true);
  });

  it('does not pre-accept a low-confidence item even when the name matches exactly', () => {
    // Below the confidence threshold, the item goes to the confirmation sheet
    // rather than the pantry.
    const [candidate] = toCandidates([
      detected({ name: 'milk', confidence: CONFIDENCE_THRESHOLD - 0.01 }),
    ]);
    expect(candidate?.accepted).toBe(false);
  });

  it('does not pre-accept a confident item whose name only partially matched', () => {
    // A confident detection with unknown product qualifiers still needs review.
    const [candidate] = toCandidates([detected({ name: 'barista oat milk', confidence: 1 })]);

    expect(candidate?.match).toBe('partial');
    expect(candidate?.accepted).toBe(false);
  });

  it('keeps an unrecognized item so the user can correct it, unaccepted', () => {
    const [candidate] = toCandidates([detected({ name: 'leftover pizza' })]);

    expect(candidate?.ingredientId).toBeNull();
    expect(candidate?.accepted).toBe(false);
    expect(candidate?.detectedName).toBe('leftover pizza');
  });

  it('marks a confidently named unmatched food as outside the catalog', () => {
    // Adding a catalog near-match for grapes would lie about what is in the
    // pantry, so this row must stay out of the accepted ids.
    const candidates = toCandidates([detected({ name: 'grapes', confidence: 0.95 })]);

    expect(candidates[0]?.unmatchedReason).toBe('out_of_catalog');
    expect(candidates[0]?.accepted).toBe(false);
    expect(acceptedIngredientIds(candidates)).toEqual([]);
  });

  it('marks a low-confidence unmatched item as a likely misread', () => {
    const candidates = toCandidates([
      detected({ name: 'blurry mystery item', confidence: CONFIDENCE_THRESHOLD - 0.01 }),
    ]);

    expect(candidates[0]?.unmatchedReason).toBe('misread');
    expect(candidates[0]?.accepted).toBe(false);
    expect(acceptedIngredientIds(candidates)).toEqual([]);
  });

  it('merges two detections of the same ingredient into one row', () => {
    // The pantry aggregates by ingredient type, so the sheet must too.
    const candidates = toCandidates([
      detected({ name: 'onion', quantity: 2 }),
      detected({ name: 'onions', quantity: 1 }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.quantity).toBe(3);
  });

  it('keeps the higher confidence when merging', () => {
    const candidates = toCandidates([
      detected({ name: 'milk', confidence: 0.4 }),
      detected({ name: 'milk', confidence: 0.9 }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.confidence).toBe(0.9);
  });

  it('does not sum quantities across different units', () => {
    const candidates = toCandidates([
      detected({ name: 'milk', quantity: 2, unit: 'pieces', confidence: 0.9 }),
      detected({ name: 'milk', quantity: 500, unit: 'milliliters', confidence: 0.5 }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.quantity).toBe(2);
  });

  it('never merges unrecognized items together', () => {
    // Two things we could not identify are not evidence of the same thing.
    const candidates = toCandidates([
      detected({ name: 'leftover pizza' }),
      detected({ name: 'mystery jar' }),
    ]);

    expect(candidates).toHaveLength(2);
  });

  it('puts actionable review rows before accepted and out-of-catalog rows', () => {
    const candidates = toCandidates([
      detected({ name: 'milk', confidence: 0.99 }),
      detected({ name: 'leftover pizza', confidence: 0.9 }),
      detected({ name: 'garlic', confidence: 0.2 }),
    ]);

    expect(candidates.map((candidate) => candidate.detectedName)).toEqual([
      'garlic',
      'milk',
      'leftover pizza',
    ]);
  });

  it('puts an uncorrectable out-of-catalog item below actionable review rows', () => {
    const candidates = toCandidates([
      detected({ name: 'grapes', confidence: 0.95 }),
      detected({ name: 'garlic', confidence: 0.2 }),
    ]);

    expect(candidates.map((candidate) => candidate.detectedName)).toEqual(['garlic', 'grapes']);
  });

  it('gives every candidate a distinct key', () => {
    const candidates = toCandidates([
      detected({ name: 'leftover pizza' }),
      detected({ name: 'mystery jar' }),
      detected({ name: 'milk' }),
    ]);

    expect(new Set(candidates.map((c) => c.key)).size).toBe(candidates.length);
  });

  it('handles an empty detection list', () => {
    expect(toCandidates([])).toEqual([]);
  });
});

describe('correctCandidate', () => {
  it('trusts the user over the model', () => {
    const [candidate] = toCandidates([detected({ name: 'oat milk', confidence: 1 })]);
    expect(candidate).toBeDefined();

    const corrected = correctCandidate(candidate!, 'almond_milk', 'almond milk');

    expect(corrected.ingredientId).toBe('almond_milk');
    expect(corrected.accepted).toBe(true);
    expect(corrected.corrected).toBe(true);
  });

  it('keeps the original detection visible after correction', () => {
    const [candidate] = toCandidates([detected({ name: 'leftover pizza' })]);
    const corrected = correctCandidate(candidate!, 'bread', 'bread');

    expect(corrected.detectedName).toBe('leftover pizza');
  });
});
