import { describe, expect, it } from 'vitest';

import { matchesCuisinePreference } from '@/engine/cuisine-preference';

describe('matchesCuisinePreference', () => {
  it.each([
    ['american', 'american'],
    ['canadian', 'american'],
    ['british', 'british'],
    ['chinese', 'chinese'],
    ['japanese', 'japanese'],
    ['korean', 'korean'],
    ['thai', 'asian'],
    ['mexican', 'hispanic/latin'],
    ['spanish', 'hispanic/latin'],
    ['nigerian', 'african'],
    ['kenyan', 'african'],
    ['indian', 'indian'],
    ['italian', 'mediterranean'],
    ['greek', 'mediterranean'],
    ['russian', 'european'],
  ])('matches %s under the %s genre', (recipeCuisine, preference) => {
    expect(matchesCuisinePreference(recipeCuisine, preference)).toBe(true);
  });

  it('keeps Indian separate from the Asian option', () => {
    expect(matchesCuisinePreference('indian', 'asian')).toBe(false);
    expect(matchesCuisinePreference('indian', 'indian')).toBe(true);
  });

  it('continues to accept exact legacy cuisine preferences', () => {
    expect(matchesCuisinePreference('thai', 'thai')).toBe(true);
    expect(matchesCuisinePreference('american', 'thai')).toBe(false);
  });
});
