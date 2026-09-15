import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { Minutes } from '@/engine/types';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

interface TimeTileProps {
  minutes: Minutes;
  /** Renders "60+" rather than "60" for the open-ended top tier. */
  openEnded?: boolean;
  selected: boolean;
  onPress: (minutes: Minutes) => void;
}

/** Spec §4: 96 × 96, radius lg. */
const TILE_SIZE = 96;

/**
 * A time choice on the home screen.
 *
 * Three tiles rather than a slider, because a slider is a decision and a tile
 * is a reflex — and time is the only required input in the entire product
 * (spec §4). Tapping one goes straight to results; the button below is a
 * fallback for users who expect confirmation, not the intended path.
 */
export function TimeTile({ minutes, openEnded = false, selected, onPress }: TimeTileProps) {
  const { color, shadow } = useTheme();

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={openEnded ? `${minutes} minutes or more` : `${minutes} minutes`}
      accessibilityHint="Shows meals you can make in this much time"
      onPress={() => onPress(minutes)}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: selected ? color.surfaceAlt : color.surface,
          borderColor: selected ? color.accent : color.border,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.85 : 1,
        },
        shadow.sm,
      ]}
    >
      <Text variant="title">{openEnded ? `${minutes}+` : minutes}</Text>
      <Text variant="caption" tone="muted">
        min
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
});
