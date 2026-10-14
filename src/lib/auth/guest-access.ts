import { useSyncExternalStore } from 'react';

import { storage } from '@/lib/storage';

const GUEST_CHOICE_KEY = 'decisioneats-auth-choice-v1';
const listeners = new Set<() => void>();

function readGuestChoice(): boolean {
  return storage.getString(GUEST_CHOICE_KEY) === 'guest';
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasGuestChoice(): boolean {
  return readGuestChoice();
}

export function continueAsGuest(): void {
  storage.set(GUEST_CHOICE_KEY, 'guest');
  for (const listener of listeners) listener();
}

export function useGuestChoice(): boolean {
  return useSyncExternalStore(subscribe, readGuestChoice, () => false);
}
