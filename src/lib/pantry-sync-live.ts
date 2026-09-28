import { useSyncExternalStore } from 'react';

import { createPantrySyncApi } from '@/lib/pantry-sync-api';
import { createPantrySyncController } from '@/lib/pantry-sync';
import { storage } from '@/lib/storage';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { installPantryMutationSink, useKitchenStore } from '@/store/kitchen';

export const pantrySync = createPantrySyncController({
  storage,
  api: createPantrySyncApi(supabase, queryClient),
  onPantry: (ids) => useKitchenStore.getState().replacePantryFromSync(ids),
});

installPantryMutationSink((id, present) => pantrySync.setIntent(id, present));

export function usePantrySyncState() {
  return useSyncExternalStore(pantrySync.subscribe, pantrySync.getState, pantrySync.getState);
}
