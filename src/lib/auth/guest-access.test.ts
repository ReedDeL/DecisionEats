import { afterEach, describe, expect, it, vi } from 'vitest';

const values = new Map<string, string>();

vi.mock('@/lib/storage', () => ({
  storage: {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => values.set(key, value),
    remove: (key: string) => values.delete(key),
  },
}));

import { continueAsGuest, hasGuestChoice } from './guest-access';

afterEach(() => values.clear());

describe('persisted guest choice', () => {
  it('stores guest access in its own key and restores it on a later read', () => {
    expect(hasGuestChoice()).toBe(false);
    continueAsGuest();
    expect(values.get('decisioneats-auth-choice-v1')).toBe('guest');
    expect(hasGuestChoice()).toBe(true);
  });
});
