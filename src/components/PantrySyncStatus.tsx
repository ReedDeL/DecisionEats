import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Text } from '@/components/ui/Text';
import { useAuthSession } from '@/lib/auth/useAuthSession';
import { pantrySync, usePantrySyncState } from '@/lib/pantry-sync-live';
import { space } from '@/theme/tokens';

/** Reports acknowledged pantry operations, separately from sign-in status. */
export function PantrySyncStatus() {
  const state = usePantrySyncState();
  const auth = useAuthSession();
  const account = auth.userId === state.userId ? auth.email : null;
  const message =
    state.phase === 'guest'
      ? 'Guest pantry saved on this device.'
      : state.phase === 'loading'
        ? 'Connecting your pantry…'
        : state.phase === 'pending'
          ? `${state.pending} pantry change${state.pending === 1 ? '' : 's'} waiting to sync.`
          : state.phase === 'error'
            ? state.pending > 0
              ? 'Your pantry changes are saved on this device. Sync needs attention.'
              : 'Could not refresh your account pantry. Try again when connected.'
            : 'Pantry synced with your account.';

  return (
    <View style={styles.status}>
      <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
        {message}
      </Text>
      {state.phase === 'error' ? (
        <PrimaryButton
          label="Retry pantry sync"
          variant="ghost"
          accessibilityHint="Retries loading your pantry and saving pending changes"
          onPress={() => void pantrySync.retry()}
        />
      ) : null}
      {state.guestImportAvailable && state.householdId && state.phase !== 'loading' ? (
        <>
          <Text variant="caption">
            Add this device&apos;s guest ingredients to {account ?? 'your signed-in account'}? Your
            existing account ingredients and guest copy will be kept.
          </Text>
          <PrimaryButton
            label="Import guest pantry"
            accessibilityHint="Confirms adding this device's guest ingredients to the signed-in account"
            onPress={() => void pantrySync.importGuest()}
          />
          <PrimaryButton
            label="Keep separate"
            variant="ghost"
            accessibilityHint="Leaves the guest pantry on this device without importing it"
            onPress={() => pantrySync.keepGuest()}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ status: { gap: space.xs } });
