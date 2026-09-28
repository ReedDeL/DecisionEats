/**
 * Inventory data access.
 *
 * Column lists are explicit everywhere -- never `select *`. A generated column
 * or a new field should not silently widen what the client pulls over the wire,
 * and an explicit list is what makes the Spoonacular field whitelist greppable
 * when Spoonacular support lands.
 */
import { supabase } from '@/lib/supabase';
import type { InventoryRow, InventorySource } from '@/types/database';

const INVENTORY_COLUMNS =
  'id, household_id, ingredient_id, quantity, unit, purchased_on, source, added_by, updated_at';

export async function fetchInventory(
  householdId: string,
  client = supabase
): Promise<InventoryRow[]> {
  const { data, error } = await client
    .from('inventory')
    .select(INVENTORY_COLUMNS)
    .eq('household_id', householdId)
    .order('ingredient_id', { ascending: true });

  if (error) throw error;
  return (data ?? []) as InventoryRow[];
}

export interface AddInventoryItem {
  householdId: string;
  ingredientId: string;
  quantity?: number | null;
  unit?: string | null;
  source?: InventorySource;
  addedBy?: string | null;
}

/**
 * Upsert, never insert. The `unique (household_id, ingredient_id)` constraint
 * enforces the "aggregate by ingredient TYPE, not brand" rule at the database
 * level: a second carton of milk increments a quantity, it does not create a
 * second row.
 */
export async function upsertInventoryItem(item: AddInventoryItem): Promise<void> {
  const { error } = await supabase.from('inventory').upsert(
    {
      household_id: item.householdId,
      ingredient_id: item.ingredientId,
      quantity: item.quantity ?? 1,
      unit: item.unit ?? null,
      source: item.source ?? 'manual',
      added_by: item.addedBy ?? null,
    },
    { onConflict: 'household_id,ingredient_id' }
  );

  if (error) throw error;
}

/**
 * The one-tap "I don't have this". This is the drift mitigation (R3): the
 * pantry is always somewhat wrong, and if correcting it is a chore the
 * recommendations rot and the user leaves.
 */
export async function removeInventoryItem(
  householdId: string,
  ingredientId: string,
  client = supabase
): Promise<void> {
  const { error } = await client
    .from('inventory')
    .delete()
    .eq('household_id', householdId)
    .eq('ingredient_id', ingredientId);

  if (error) throw error;
}

/** Presence-only add: retain quantity, source and other metadata on duplicates. */
export async function addInventoryPresence(
  householdId: string,
  ingredientId: string,
  userId: string,
  client = supabase
): Promise<void> {
  const { error } = await client.from('inventory').upsert(
    {
      household_id: householdId,
      ingredient_id: ingredientId,
      added_by: userId,
      source: 'manual',
    },
    { onConflict: 'household_id,ingredient_id', ignoreDuplicates: true }
  );
  if (error) throw error;
}
