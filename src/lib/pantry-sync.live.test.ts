/**
 * Opt-in live pantry proof. Run only with a disposable fixture file:
 *   PANTRY_SYNC_FIXTURE_PATH=/tmp/decisioneats-pantry-live-fixture.json npx vitest run src/lib/pantry-sync.live.test.ts
 * The file contains url, key, and two disposable a/b {id,email,password}
 * accounts. Never commit the fixture file or print its contents.
 */
import { readFileSync } from 'node:fs';
import { QueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createPantrySyncApi } from '@/lib/pantry-sync-api';
import { createPantrySyncController } from '@/lib/pantry-sync';
import type { PantrySyncStorage } from '@/lib/pantry-sync';
import type { Database } from '@/types/supabase-journeys';

// The proof must use the three injected clients. If a query reaches the app
// singleton, fail clearly without loading native auth storage or app env.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      throw new Error('Live proof used the default Supabase client');
    },
  },
}));

interface Identity {
  id: string;
  email: string;
  password: string;
}
interface Fixture {
  url: string;
  key: string;
  a: Identity;
  b: Identity;
}

function storage(): PantrySyncStorage {
  const values = new Map<string, string>();
  return {
    getString: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value);
    },
  };
}
async function eventually(check: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 12000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for ' + label);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe.skipIf(!process.env.PANTRY_SYNC_FIXTURE_PATH)('live pantry sync', () => {
  it('uses independent signed-in clients for add, delete, isolation, and account switch', async () => {
    const fixture = JSON.parse(
      readFileSync(process.env.PANTRY_SYNC_FIXTURE_PATH!, 'utf8')
    ) as Fixture;
    expect(fixture.url).toMatch(/^https:\/\//);
    expect(fixture.key.length).toBeGreaterThan(0);
    expect(fixture.a.id).not.toBe(fixture.b.id);
    const options = {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    };
    const a1 = createClient<Database>(fixture.url, fixture.key, options);
    const a2 = createClient<Database>(fixture.url, fixture.key, options);
    const b = createClient<Database>(fixture.url, fixture.key, options);
    const cacheOptions = { defaultOptions: { queries: { retry: false } } };
    const apiA1 = createPantrySyncApi(a1, new QueryClient(cacheOptions));
    const apiA2 = createPantrySyncApi(a2, new QueryClient(cacheOptions));
    const apiB = createPantrySyncApi(b, new QueryClient(cacheOptions));
    let pantryA1: string[] = [];
    let pantryA2: string[] = [];
    let pantryB: string[] = [];
    const controllerA1 = createPantrySyncController({
      storage: storage(),
      api: apiA1,
      onPantry: (ids) => {
        pantryA1 = [...ids];
      },
    });
    const controllerA2 = createPantrySyncController({
      storage: storage(),
      api: apiA2,
      onPantry: (ids) => {
        pantryA2 = [...ids];
      },
    });
    const controllerB = createPantrySyncController({
      storage: storage(),
      api: apiB,
      onPantry: (ids) => {
        pantryB = [...ids];
      },
    });
    const signIn = async (client: typeof a1, identity: Identity) => {
      const { data, error } = await client.auth.signInWithPassword({
        email: identity.email,
        password: identity.password,
      });
      if (error) throw error;
      expect(data.user?.id).toBe(identity.id);
    };
    try {
      await Promise.all([signIn(a1, fixture.a), signIn(a2, fixture.a), signIn(b, fixture.b)]);
      await Promise.all([
        controllerA1.setIdentity(fixture.a.id),
        controllerA2.setIdentity(fixture.a.id),
        controllerB.setIdentity(fixture.b.id),
      ]);
      expect(controllerA1.getState().phase).toBe('synced');
      expect(controllerA2.getState().phase).toBe('synced');
      expect(controllerB.getState().phase).toBe('synced');
      expect(pantryA1).toEqual([]);
      expect(pantryA2).toEqual([]);
      expect(pantryB).toEqual([]);

      controllerA1.setIntent('egg', true);
      await eventually(
        () => controllerA1.getState().phase === 'synced' && controllerA1.getState().pending === 0,
        'A1 add'
      );
      await controllerA2.refresh();
      expect(pantryA2).toEqual(['egg']);
      await controllerB.refresh();
      expect(pantryB).toEqual([]);
      const aHousehold = controllerA1.getState().householdId!;
      expect(await apiB.fetch(aHousehold)).toEqual([]);
      await expect(apiB.add(aHousehold, 'milk', fixture.b.id)).rejects.toBeTruthy();

      controllerA2.setIntent('egg', false);
      await eventually(
        () => controllerA2.getState().phase === 'synced' && controllerA2.getState().pending === 0,
        'A2 delete'
      );
      await controllerA1.refresh();
      expect(pantryA1).toEqual([]);
      expect(await apiA1.fetch(aHousehold)).toEqual([]);

      controllerA1.setIntent('egg', true);
      await eventually(() => controllerA1.getState().pending === 0, 'A1 repeat add');
      controllerA1.setIntent('egg', true);
      await eventually(() => controllerA1.getState().pending === 0, 'A1 repeated add');
      expect(await apiA1.fetch(aHousehold)).toEqual(['egg']);
      controllerA1.setIntent('egg', false);
      await eventually(() => controllerA1.getState().pending === 0, 'A1 repeat delete');
      controllerA1.setIntent('egg', false);
      await eventually(() => controllerA1.getState().pending === 0, 'A1 repeated delete');
      expect(await apiA1.fetch(aHousehold)).toEqual([]);

      controllerA1.setIntent('egg', true);
      await eventually(() => controllerA1.getState().pending === 0, 'A1 before account switch');
      await signIn(a1, fixture.b);
      const switched = controllerA1.setIdentity(fixture.b.id);
      expect(pantryA1).toEqual([]);
      await switched;
      expect(pantryA1).toEqual([]);
      expect(controllerA1.getState().householdId).toBe(controllerB.getState().householdId);
      const signingOut = a1.auth.signOut();
      const clearing = controllerA1.setIdentity(null);
      expect(pantryA1).toEqual([]);
      await Promise.all([signingOut, clearing]);
      expect(controllerA1.getState().phase).toBe('guest');
    } finally {
      // The fixture accounts are disposable; remove any test item if a
      // mid-test assertion failed, then close each independent session.
      try {
        await apiA2.remove(controllerA2.getState().householdId!, 'egg');
      } catch {
        /* root also deletes fixtures */
      }
      await Promise.allSettled([a1.auth.signOut(), a2.auth.signOut(), b.auth.signOut()]);
    }
  }, 60000);
});
