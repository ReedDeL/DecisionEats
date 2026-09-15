import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Use checkbox semantics for chips that can be selected independently. */
  accessibilityRole?: 'button' | 'checkbox';
  /** Non-interactive metadata, e.g. the missing-ingredient list on a card. */
  readOnly?: boolean;
}

/**
 * A pill. Selected state is a fill, not a checkmark, so the state is legible
 * at a glance from across a kitchen counter.
 *
 * 44pt minimum height even though the visual pill is shorter — the spec's
 * touch-target floor (§1.4) applies to every interactive element, and a chip
 * row is exactly where a thumb misses.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  readOnly = false,
}: ChipProps) {
  const { color } = useTheme();

  const background = color.surfaceAlt;
  const border = selected ? color.accent : color.border;

  if (readOnly) {
    return (
      <Text
        variant="caption"
        tone="muted"
        style={[styles.chip, styles.readOnly, { backgroundColor: color.surfaceAlt }]}
      >
        {label}
      </Text>
    );
  }

  return (
    <Pressable
      accessible
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'checkbox' ? { checked: selected } : { selected }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: background,
          borderColor: border,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touchTarget.standard,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  readOnly: {
    paddingVertical: space.sm,
    overflow: 'hidden',
  },
  label: { fontWeight: '600' },
});
