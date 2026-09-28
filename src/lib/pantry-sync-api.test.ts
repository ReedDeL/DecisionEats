import { QueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createPantrySyncApi } from '@/lib/pantry-sync-api';
import type { Database } from '@/types/supabase-journeys';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      throw new Error('Default client used in injected pantry API');
    },
  },
}));

type Table = 'profiles' | 'household_members' | 'inventory';
interface Call {
  table: Table;
  method: string;
  columns?: string;
  filters?: Record<string, string>;
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
}
function fakeClient(
  options: {
    profiles?: Record<string, string>;
    members?: Array<{ user: string; household: string }>;
    inventory?: Record<string, string[]>;
  } = {}
) {
  const calls: Call[] = [];
  const rows = options.inventory ?? {};
  const client = {
    from(table: Table) {
      const filters: Record<string, string> = {};
      let columns = '';
      let method = 'select';
      const builder = {
        select(value: string) {
          columns = value;
          return this;
        },
        eq(key: string, value: string) {
          filters[key] = value;
          return this;
        },
        maybeSingle() {
          calls.push({ table, method, columns, filters: { ...filters } });
          if (table === 'profiles') {
            const household = options.profiles?.[filters.id ?? ''];
            return Promise.resolve({
              data: household ? { id: filters.id, household_id: household } : null,
              error: null,
            });
          }
          const found = options.members?.some(
            (member) => member.user === filters.user_id && member.household === filters.household_id
          );
          return Promise.resolve({
            data: found ? { household_id: filters.household_id } : null,
            error: null,
          });
        },
        order() {
          calls.push({ table, method, columns, filters: { ...filters } });
          return Promise.resolve({
            data: (rows[filters.household_id ?? ''] ?? []).map((id) => ({ ingredient_id: id })),
            error: null,
          });
        },
        upsert(payload: Record<string, unknown>, upsertOptions: Record<string, unknown>) {
          calls.push({ table, method: 'upsert', payload, options: upsertOptions });
          return Promise.resolve({ error: null });
        },
        delete() {
          method = 'delete';
          return this;
        },
        then(resolve: (value: { error: null }) => void) {
          calls.push({ table, method, filters: { ...filters } });
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

describe('injected pantry API', () => {
  it('resolves only a matching profile and authoritative membership', async () => {
    const { client, calls } = fakeClient({
      profiles: { a: 'ha', b: 'hb' },
      members: [{ user: 'a', household: 'ha' }],
    });
    const api = createPantrySyncApi(client);
    expect(await api.resolveHousehold('a')).toBe('ha');
    expect(await api.resolveHousehold('b')).toBeNull();
    expect(await api.resolveHousehold('missing')).toBeNull();
    expect(calls.filter((call) => call.table === 'household_members')).toEqual([
      expect.objectContaining({ filters: { user_id: 'a', household_id: 'ha' } }),
      expect.objectContaining({ filters: { user_id: 'b', household_id: 'hb' } }),
    ]);
    expect(calls.map((call) => call.table)).toEqual([
      'profiles',
      'household_members',
      'profiles',
      'household_members',
      'profiles',
    ]);
  });

  it('scopes cached profile and inventory reads by account and household', async () => {
    const { client, calls } = fakeClient({
      profiles: { a: 'ha', b: 'hb' },
      members: [
        { user: 'a', household: 'ha' },
        { user: 'b', household: 'hb' },
      ],
      inventory: { ha: ['egg'], hb: ['rice'] },
    });
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const api = createPantrySyncApi(client, cache);
    expect(await api.resolveHousehold('a')).toBe('ha');
    expect(await api.resolveHousehold('b')).toBe('hb');
    expect(await api.fetch('ha', 'a')).toEqual(['egg']);
    expect(await api.fetch('hb', 'b')).toEqual(['rice']);
    expect(cache.getQueryData(['pantry-sync', 'a', 'ha', 'inventory'])).toBeDefined();
    expect(cache.getQueryData(['pantry-sync', 'b', 'hb', 'inventory'])).toBeDefined();
    api.clearCache?.('a');
    expect(cache.getQueryData(['pantry-sync', 'a', 'ha', 'inventory'])).toBeUndefined();
    expect(cache.getQueryData(['pantry-sync', 'b', 'hb', 'inventory'])).toBeDefined();
    expect(calls.filter((call) => call.table === 'inventory').map((call) => call.filters)).toEqual([
      { household_id: 'ha' },
      { household_id: 'hb' },
    ]);
  });

  it('sends presence-only duplicate-safe adds and exact household/ingredient deletes', async () => {
    const { client, calls } = fakeClient();
    const api = createPantrySyncApi(client);
    await api.add('ha', 'egg', 'a');
    await api.remove('ha', 'egg');
    const add = calls.find((call) => call.method === 'upsert');
    expect(add).toEqual({
      table: 'inventory',
      method: 'upsert',
      payload: {
        household_id: 'ha',
        ingredient_id: 'egg',
        added_by: 'a',
        source: 'manual',
      },
      options: { onConflict: 'household_id,ingredient_id', ignoreDuplicates: true },
    });
    expect(calls.find((call) => call.method === 'delete')).toEqual({
      table: 'inventory',
      method: 'delete',
      filters: { household_id: 'ha', ingredient_id: 'egg' },
    });
    expect(
      calls.every((call) => ['profiles', 'household_members', 'inventory'].includes(call.table))
    ).toBe(true);
    expect(Object.keys(add!.payload!)).not.toContain('bodyGoal');
    expect(Object.keys(add!.payload!)).not.toContain('bodyMetrics');
    expect(Object.keys(add!.payload!)).not.toContain('quantity');
    expect(Object.keys(add!.payload!)).not.toContain('unit');
  });
});
