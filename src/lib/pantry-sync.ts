import type { IngredientId } from '@/engine/types';

export const GUEST_PANTRY_KEY = 'decisioneats-guest-pantry-v1';
const KEY_PREFIX = 'decisioneats-pantry-v1:';

export interface PantrySyncStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}
export interface PantrySyncApi {
  resolveHousehold(userId: string): Promise<string | null>;
  fetch(householdId: string, userId?: string): Promise<string[]>;
  clearCache?(userId: string | null): void;
  add(householdId: string, ingredientId: string, userId: string): Promise<void>;
  remove(householdId: string, ingredientId: string): Promise<void>;
}
interface Intent {
  id: string;
  present: boolean;
  revision: number;
}
interface ScopedData {
  base: string[];
  intents: Intent[];
  imported: string[];
  revision: number;
}
export interface PantrySyncState {
  phase: 'guest' | 'loading' | 'pending' | 'synced' | 'error';
  userId: string | null;
  householdId: string | null;
  pending: number;
  guestImportAvailable: boolean;
  message: string | null;
}
export interface PantrySyncController {
  setIdentity(userId: string | null): Promise<void>;
  setIntent(id: IngredientId, present: boolean): void;
  refresh(): Promise<void>;
  retry(): Promise<void>;
  importGuest(): Promise<void>;
  keepGuest(): void;
  resetLocal(): void;
  getState(): PantrySyncState;
  subscribe(listener: () => void): () => void;
}

function read<T>(storage: PantrySyncStorage, key: string, fallback: T): T {
  try {
    const raw = storage.getString(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
}
function projection(data: ScopedData): string[] {
  const ids = new Set(data.base);
  for (const intent of data.intents) {
    if (intent.present) ids.add(intent.id);
    else ids.delete(intent.id);
  }
  return [...ids];
}
function normalize(value: ScopedData | null, legacyImported: string[] = []): ScopedData {
  if (!value || typeof value !== 'object')
    value = { base: [], intents: [], imported: [], revision: 0 };
  const intents = Array.isArray(value.intents)
    ? value.intents.filter(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          item.id.length > 0 &&
          typeof item.present === 'boolean' &&
          Number.isSafeInteger(item.revision) &&
          item.revision > 0
      )
    : [];
  return {
    base: unique(Array.isArray(value.base) ? value.base : []),
    intents,
    imported: unique(Array.isArray(value.imported) ? value.imported : legacyImported),
    revision: Math.max(
      Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0,
      ...intents.map((intent) => intent.revision)
    ),
  };
}

/** A device-local, account and household scoped operation queue. */
export function createPantrySyncController({
  storage,
  api,
  onPantry,
}: {
  storage: PantrySyncStorage;
  api: PantrySyncApi;
  onPantry: (ids: IngredientId[]) => void;
}): PantrySyncController {
  let generation = 0;
  let userId: string | null = null;
  let householdId: string | null = null;
  let scoped: ScopedData | null = null;
  let writeRunningFor: number | null = null;
  let fetchRunningFor: number | null = null;
  let dismissedImportFor: string | null = null;
  let loaded = false;
  let readError: string | null = null;
  let state: PantrySyncState = {
    phase: 'loading',
    userId: null,
    householdId: null,
    pending: 0,
    guestImportAvailable: false,
    message: null,
  };
  const listeners = new Set<() => void>();
  const guest = () => {
    const saved = read<unknown>(storage, GUEST_PANTRY_KEY, []);
    return unique(Array.isArray(saved) ? saved : []);
  };
  const key = () => `${KEY_PREFIX}${userId}:${householdId}`;
  const importKey = () => `${key()}:imported`;
  const importedIds = () => scoped?.imported ?? [];
  const current = (token: number, owner: string | null = userId) =>
    token === generation && owner === userId;
  const emit = (next: Partial<PantrySyncState> = {}) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const show = () => {
    if (scoped) onPantry(projection(scoped));
    emit({
      pending: scoped?.intents.length ?? 0,
      guestImportAvailable:
        !!userId &&
        guest().some((id) => !importedIds().includes(id)) &&
        dismissedImportFor !== userId,
    });
  };
  const save = () => {
    if (scoped && userId && householdId) storage.set(key(), JSON.stringify(scoped));
  };
  const failureMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Pantry sync failed';
  const fail = (error: unknown) => {
    emit({ phase: 'error', message: failureMessage(error) });
  };
  const settledPhase = () => ({
    phase: readError ? ('error' as const) : loaded ? ('synced' as const) : ('loading' as const),
    message: readError,
  });
  const flush = async (): Promise<void> => {
    if (
      writeRunningFor === generation ||
      !scoped ||
      !userId ||
      !householdId ||
      state.phase === 'error'
    )
      return;
    writeRunningFor = generation;
    const token = generation;
    const owner = userId;
    const household = householdId;
    try {
      while (current(token, owner) && scoped?.intents.length) {
        const intent: Intent | undefined = scoped.intents[0];
        if (!intent) break;
        try {
          if (intent.present) await api.add(household, intent.id, owner);
          else await api.remove(household, intent.id);
        } catch (error) {
          if (current(token, owner)) fail(error);
          return;
        }
        if (!current(token, owner) || !scoped) return;
        const beforeAck = scoped;
        const base: Set<string> = new Set(scoped.base);
        if (intent.present) base.add(intent.id);
        else base.delete(intent.id);
        // Keep the acknowledged operation on disk until the new snapshot is durable.
        scoped = {
          base: [...base],
          revision: scoped.revision + 1,
          imported: scoped.imported,
          intents: scoped.intents.filter((item) => item.revision !== intent.revision),
        };
        try {
          save();
        } catch (error) {
          scoped = beforeAck;
          show();
          fail(error);
          return;
        }
        show();
      }
      if (current(token, owner)) emit(settledPhase());
    } finally {
      if (writeRunningFor === token) writeRunningFor = null;
    }
  };
  const refresh = async (): Promise<void> => {
    if (!userId || !householdId || !scoped || fetchRunningFor === generation) return;
    const token = generation;
    const owner = userId;
    const household = householdId;
    const revision = scoped.revision;
    let retryStale = false;
    fetchRunningFor = token;
    try {
      const remote = await api.fetch(household, owner);
      if (!current(token, owner) || !scoped) return;
      if (scoped.revision !== revision) {
        retryStale = !loaded && !readError;
        return;
      }
      scoped.base = unique(remote);
      save();
      loaded = true;
      readError = null;
      show();
      emit({
        phase: scoped.intents.length ? 'pending' : settledPhase().phase,
        message: readError,
      });
      await flush();
    } catch (error) {
      if (current(token, owner)) {
        readError = failureMessage(error);
        fail(error);
      }
    } finally {
      if (fetchRunningFor === token) fetchRunningFor = null;
      if (retryStale && current(token, owner)) void refresh();
    }
  };
  const setIdentity = async (nextUserId: string | null): Promise<void> => {
    if (nextUserId === userId && (scoped || state.phase === 'guest')) return;
    api.clearCache?.(userId);
    generation += 1;
    const token = generation;
    userId = nextUserId;
    householdId = null;
    scoped = null;
    loaded = false;
    readError = null;
    writeRunningFor = null;
    fetchRunningFor = null;
    // Clear the old account projection in the auth callback, before any network work.
    onPantry(nextUserId ? [] : guest());
    emit({
      phase: nextUserId ? 'loading' : 'guest',
      userId: nextUserId,
      householdId: null,
      pending: 0,
      guestImportAvailable: false,
      message: null,
    });
    if (!nextUserId) return;
    // Let Supabase finish the auth callback before querying with its client.
    await Promise.resolve();
    if (!current(token, nextUserId)) return;
    try {
      const household = await api.resolveHousehold(nextUserId);
      if (!current(token, nextUserId)) return;
      if (!household) throw new Error('Your household is not ready. Retry pantry sync.');
      householdId = household;
      const legacyImport = read<unknown>(storage, importKey(), []);
      scoped = normalize(
        read<ScopedData>(storage, key(), { base: [], intents: [], imported: [], revision: 0 }),
        Array.isArray(legacyImport) ? unique(legacyImport) : []
      );
      show();
      emit({ householdId: household, phase: 'loading' });
      await refresh();
    } catch (error) {
      if (current(token, nextUserId)) fail(error);
    }
  };
  const setIntent = (id: IngredientId, present: boolean): void => {
    if (!userId) {
      const before = guest();
      const ids = new Set(before);
      if (present) ids.add(id);
      else ids.delete(id);
      try {
        storage.set(GUEST_PANTRY_KEY, JSON.stringify([...ids]));
        onPantry([...ids]);
      } catch (error) {
        onPantry(before);
        fail(error);
      }
      return;
    }
    if (!scoped) {
      onPantry([]);
      fail(new Error('Pantry is connecting. Retry after it loads.'));
      return;
    }
    const before: ScopedData = { ...scoped, intents: [...scoped.intents] };
    scoped.revision += 1;
    scoped.intents.push({ id, present, revision: scoped.revision });
    try {
      save();
      show();
      emit({ phase: 'pending', message: readError });
      void flush();
    } catch (error) {
      scoped = before;
      show();
      fail(error);
    }
  };
  return {
    setIdentity,
    setIntent,
    refresh,
    retry: async () => {
      if (!userId) {
        emit({ phase: 'guest', message: null });
        return;
      }
      if (!scoped) {
        const retryUser = userId;
        userId = null;
        await setIdentity(retryUser);
        return;
      }
      emit({ phase: scoped?.intents.length ? 'pending' : 'loading', message: null });
      await refresh();
      await flush();
    },
    importGuest: async () => {
      if (!userId || !scoped) return;
      const existing = new Set(projection(scoped));
      const imported = new Set(importedIds());
      const beforeImport: ScopedData = { ...scoped, intents: [...scoped.intents] };
      const guests = guest();
      for (const id of guests) {
        if (!imported.has(id) && !existing.has(id)) {
          scoped.revision += 1;
          scoped.intents.push({ id, present: true, revision: scoped.revision });
          existing.add(id);
        }
      }
      scoped.imported = unique([...imported, ...guests]);
      try {
        // Import choice and its queued adds become durable in one scoped write.
        save();
      } catch (error) {
        scoped = beforeImport;
        show();
        fail(error);
        return;
      }
      show();
      emit({
        phase: scoped.intents.length ? 'pending' : settledPhase().phase,
        message: readError,
      });
      await flush();
    },
    resetLocal: () => {
      storage.set(GUEST_PANTRY_KEY, JSON.stringify([]));
      if (userId && scoped) {
        show(); // Account pantry is server-owned; local reset must not create deletions.
      } else if (!userId) {
        onPantry([]);
        emit({ phase: 'guest', guestImportAvailable: false });
      }
    },
    keepGuest: () => {
      dismissedImportFor = userId;
      show();
    },
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
