import { describe, expect, it, vi } from 'vitest';
import {
  createPantrySyncController,
  GUEST_PANTRY_KEY,
  type PantrySyncApi,
} from '@/lib/pantry-sync';

function memory(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
}
function server() {
  const rows = new Map<string, Set<string>>();
  const household = (user: string) => (user === 'B' ? 'HB' : 'HA');
  const api: PantrySyncApi = {
    resolveHousehold: async (user) => household(user),
    fetch: async (house) => [...(rows.get(house) ?? [])],
    add: async (house, id) => {
      const ids = rows.get(house) ?? new Set<string>();
      ids.add(id);
      rows.set(house, ids);
    },
    remove: async (house, id) => {
      rows.get(house)?.delete(id);
    },
  };
  return { api, rows };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settled(condition: () => boolean) {
  await vi.waitFor(() => expect(condition()).toBe(true));
}

describe('pantry sync controller', () => {
  it('keeps guest copy and imports additively only after an explicit choice', async () => {
    const storage = memory({ [GUEST_PANTRY_KEY]: JSON.stringify(['rice']) });
    const { api, rows } = server();
    const visible: string[][] = [];
    const sync = createPantrySyncController({ storage, api, onPantry: (ids) => visible.push(ids) });
    await sync.setIdentity(null);
    expect(visible.at(-1)).toEqual(['rice']);
    await sync.setIdentity('A');
    expect(visible.at(-1)).toEqual([]);
    expect(sync.getState().guestImportAvailable).toBe(true);
    expect(rows.get('HA')).toBeUndefined();
    await sync.importGuest();
    expect(rows.get('HA')).toEqual(new Set(['rice']));
    expect(JSON.parse(storage.getString(GUEST_PANTRY_KEY)!)).toEqual(['rice']);
    await sync.setIdentity(null);
    expect(visible.at(-1)).toEqual(['rice']);
    await sync.setIdentity('B');
    expect(visible.at(-1)).toEqual([]);
    expect(sync.getState().guestImportAvailable).toBe(true);
  });

  it('survives failed writes and restart with owner-scoped pending overlay', async () => {
    const storage = memory();
    const { api, rows } = server();
    const add = api.add;
    let offline = true;
    api.add = async (...args) => {
      if (offline) throw new Error('offline');
      return add(...args);
    };
    const first = createPantrySyncController({ storage, api, onPantry: () => undefined });
    await first.setIdentity('A');
    first.setIntent('egg', true);
    await settled(() => first.getState().phase === 'error');
    expect(first.getState().pending).toBe(1);
    const visible: string[][] = [];
    const restarted = createPantrySyncController({
      storage,
      api,
      onPantry: (ids) => visible.push(ids),
    });
    await restarted.setIdentity('B');
    expect(visible.at(-1)).toEqual([]);
    expect(rows.get('HB')).toBeUndefined();
    await restarted.setIdentity('A');
    expect(visible.at(-1)).toEqual(['egg']);
    offline = false;
    await restarted.retry();
    await settled(() => restarted.getState().phase === 'synced');
    expect(rows.get('HA')).toEqual(new Set(['egg']));
    expect(restarted.getState().pending).toBe(0);
  });

  it('does not let a stale fetch erase a newly acknowledged add', async () => {
    const storage = memory();
    const { api } = server();
    const visible: string[][] = [];
    const sync = createPantrySyncController({ storage, api, onPantry: (ids) => visible.push(ids) });
    await sync.setIdentity('A');
    const oldRead = deferred<string[]>();
    api.fetch = () => oldRead.promise;
    const refreshing = sync.refresh();
    sync.setIntent('egg', true);
    await settled(() => sync.getState().pending === 0);
    oldRead.resolve([]);
    await refreshing;
    expect(visible.at(-1)).toEqual(['egg']);
    expect(sync.getState().phase).toBe('synced');
  });

  it('ignores old account writes and profile completions after identity switch', async () => {
    const storage = memory();
    const { api } = server();
    const oldWrite = deferred<void>();
    api.add = async (house) => {
      if (house === 'HA') await oldWrite.promise;
    };
    const visible: string[][] = [];
    const sync = createPantrySyncController({ storage, api, onPantry: (ids) => visible.push(ids) });
    await sync.setIdentity('A');
    sync.setIntent('egg', true);
    await sync.setIdentity('B');
    expect(visible.at(-1)).toEqual([]);
    oldWrite.resolve();
    await Promise.resolve();
    expect(visible.at(-1)).toEqual([]);
    expect(sync.getState().userId).toBe('B');

    const oldProfile = deferred<string | null>();
    api.resolveHousehold = (user) => (user === 'A' ? oldProfile.promise : Promise.resolve('HB'));
    void sync.setIdentity('A');
    await sync.setIdentity('B');
    oldProfile.resolve('HA');
    await Promise.resolve();
    expect(sync.getState().householdId).toBe('HB');
    expect(visible.at(-1)).toEqual([]);
  });

  it('serializes a failed add followed by a delete and leaves the server absent', async () => {
    const storage = memory();
    const { api, rows } = server();
    const realAdd = api.add;
    let first = true;
    api.add = async (...args) => {
      if (first) {
        first = false;
        throw new Error('offline');
      }
      await realAdd(...args);
    };
    const sync = createPantrySyncController({ storage, api, onPantry: () => undefined });
    await sync.setIdentity('A');
    sync.setIntent('egg', true);
    await settled(() => sync.getState().phase === 'error');
    sync.setIntent('egg', false);
    await settled(() => sync.getState().pending === 0);
    expect(rows.get('HA')?.has('egg')).toBe(false);
  });

  it('does not send an intent when local storage rejects it', async () => {
    const storage = memory();
    const { api } = server();
    const add = vi.fn(api.add);
    api.add = add;
    const visible: string[][] = [];
    const sync = createPantrySyncController({ storage, api, onPantry: (ids) => visible.push(ids) });
    await sync.setIdentity('A');
    storage.set = () => {
      throw new Error('storage full');
    };
    sync.setIntent('egg', true);
    expect(sync.getState().phase).toBe('error');
    expect(visible.at(-1)).toEqual([]);
    expect(add).not.toHaveBeenCalled();
  });

  it('keeps a failed cloud read visible after a later successful add', async () => {
    const storage = memory();
    const { api, rows } = server();
    rows.set('HA', new Set(['rice']));
    const realFetch = api.fetch;
    let offline = true;
    api.fetch = async (...args) => {
      if (offline) throw new Error('read offline');
      return realFetch(...args);
    };
    const visible: string[][] = [];
    const sync = createPantrySyncController({ storage, api, onPantry: (ids) => visible.push(ids) });
    await sync.setIdentity('A');
    expect(sync.getState().phase).toBe('error');
    sync.setIntent('egg', true);
    await settled(() => rows.get('HA')?.has('egg') === true && sync.getState().pending === 0);
    expect(sync.getState()).toMatchObject({ phase: 'error', message: 'read offline' });
    expect(visible.at(-1)).toEqual(['egg']);
    offline = false;
    await sync.retry();
    expect(sync.getState().phase).toBe('synced');
    expect(visible.at(-1)).toEqual(expect.arrayContaining(['rice', 'egg']));
  });

  it('keeps a failed cloud read visible after a successful guest import write', async () => {
    const storage = memory({ [GUEST_PANTRY_KEY]: JSON.stringify(['egg']) });
    const { api, rows } = server();
    rows.set('HA', new Set(['rice']));
    api.fetch = async () => {
      throw new Error('read offline');
    };
    const sync = createPantrySyncController({ storage, api, onPantry: () => undefined });
    await sync.setIdentity('A');
    await sync.importGuest();
    expect(rows.get('HA')).toEqual(new Set(['rice', 'egg']));
    expect(sync.getState()).toMatchObject({
      phase: 'error',
      pending: 0,
      message: 'read offline',
      guestImportAvailable: false,
    });
  });

  it('does not clear a read error when guest import has no write to queue', async () => {
    const storage = memory({
      [GUEST_PANTRY_KEY]: JSON.stringify(['rice']),
      'decisioneats-pantry-v1:A:HA': JSON.stringify({
        base: ['rice'],
        intents: [],
        imported: [],
        revision: 0,
      }),
    });
    const { api } = server();
    api.fetch = async () => {
      throw new Error('read offline');
    };
    const sync = createPantrySyncController({ storage, api, onPantry: () => undefined });
    await sync.setIdentity('A');
    expect(sync.getState().phase).toBe('error');
    await sync.importGuest();
    expect(sync.getState()).toMatchObject({
      phase: 'error',
      pending: 0,
      message: 'read offline',
      guestImportAvailable: false,
    });
  });

  it('replays an acknowledged server write when saving its acknowledgement fails', async () => {
    const storage = memory();
    const { api, rows } = server();
    const add = vi.fn(api.add);
    api.add = add;
    const originalSet = storage.set;
    let scopedWrites = 0;
    storage.set = (key, value) => {
      if (key === 'decisioneats-pantry-v1:A:HA' && ++scopedWrites === 3) {
        throw new Error('storage full');
      }
      originalSet(key, value);
    };
    const sync = createPantrySyncController({ storage, api, onPantry: () => undefined });
    await sync.setIdentity('A');
    sync.setIntent('egg', true);
    await settled(() => sync.getState().phase === 'error');
    expect(sync.getState().pending).toBe(1);
    expect(rows.get('HA')).toEqual(new Set(['egg']));
    expect(JSON.parse(storage.getString('decisioneats-pantry-v1:A:HA')!).intents).toHaveLength(1);
    await sync.retry();
    expect(sync.getState().phase).toBe('synced');
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('keeps guest import and its outbox together across a failed local save', async () => {
    const storage = memory({ [GUEST_PANTRY_KEY]: JSON.stringify(['rice']) });
    const { api, rows } = server();
    const sync = createPantrySyncController({ storage, api, onPantry: () => undefined });
    await sync.setIdentity('A');
    const originalSet = storage.set;
    storage.set = (key, value) => {
      if (key === 'decisioneats-pantry-v1:A:HA') throw new Error('storage full');
      originalSet(key, value);
    };
    await sync.importGuest();
    expect(sync.getState().phase).toBe('error');
    expect(sync.getState().guestImportAvailable).toBe(true);
    expect(rows.get('HA')).toBeUndefined();
    storage.set = originalSet;
    await sync.importGuest();
    expect(sync.getState().phase).toBe('synced');
    expect(sync.getState().guestImportAvailable).toBe(false);
    const saved = JSON.parse(storage.getString('decisioneats-pantry-v1:A:HA')!);
    expect(saved.imported).toEqual(['rice']);
    expect(saved.intents).toEqual([]);
  });

  it('tolerates valid JSON with invalid persisted shapes', async () => {
    const storage = memory({
      [GUEST_PANTRY_KEY]: 'null',
      'decisioneats-pantry-v1:A:HA': 'null',
      'decisioneats-pantry-v1:A:HA:imported': 'null',
    });
    const { api } = server();
    const sync = createPantrySyncController({ storage, api, onPantry: () => undefined });
    await sync.setIdentity(null);
    await sync.setIdentity('A');
    expect(sync.getState().phase).toBe('synced');
    expect(sync.getState().guestImportAvailable).toBe(false);
  });
});
