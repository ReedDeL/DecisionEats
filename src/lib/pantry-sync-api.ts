import type { QueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase-journeys';
import type { PantrySyncApi } from '@/lib/pantry-sync';
import { addInventoryPresence, fetchInventory, removeInventoryItem } from '@/lib/queries/inventory';
import { fetchProfile } from '@/lib/queries/preferences';

/** Query keys include both identity and household; a cached A row cannot serve B. */
export function createPantrySyncApi(
  client: SupabaseClient<Database>,
  queryClient?: QueryClient
): PantrySyncApi {
  const query = <T>(key: readonly string[], run: () => Promise<T>): Promise<T> =>
    queryClient
      ? queryClient.fetchQuery({ queryKey: key, queryFn: run, staleTime: 0, retry: false })
      : run();
  return {
    clearCache(userId) {
      if (!queryClient || !userId) return;
      const queryKey = ['pantry-sync', userId];
      void queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    },
    async resolveHousehold(userId) {
      const profile = await query(['pantry-sync', userId, 'profile'], () =>
        fetchProfile(userId, client)
      );
      if (!profile?.household_id) return null;
      const householdId = profile.household_id;
      const membership = await query(
        ['pantry-sync', userId, householdId, 'membership'],
        async () => {
          const { data, error } = await client
            .from('household_members')
            .select('household_id')
            .eq('user_id', userId)
            .eq('household_id', householdId)
            .maybeSingle();
          if (error) throw error;
          return data;
        }
      );
      return membership?.household_id ?? null;
    },
    async fetch(householdId, userId) {
      const rows = await query(['pantry-sync', userId ?? 'direct', householdId, 'inventory'], () =>
        fetchInventory(householdId, client)
      );
      return rows.map((row) => row.ingredient_id);
    },
    add: (householdId, ingredientId, userId) =>
      addInventoryPresence(householdId, ingredientId, userId, client),
    remove: (householdId, ingredientId) => removeInventoryItem(householdId, ingredientId, client),
  };
}
