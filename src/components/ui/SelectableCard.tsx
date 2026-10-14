import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { selectionKeyboardProps } from '@/lib/selection-keyboard';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

interface SelectableCardProps {
  title: string;
  icon?: IconName;
  /** The subtitle does the explaining — the spec allows no help text or tooltip. */
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  accessibilityHint: string;
  role?: 'radio' | 'checkbox';
}

/** Spec §3: 72pt tall, accent border when selected. */
const CARD_HEIGHT = 72;

/**
 * A selectable row, used for single-choice and multi-choice selections.
 *
 * Selection is shown with an accent border *and* a filled marker rather than
 * colour alone, so it survives a colour-blind user and a greyscale screenshot.
 */
export function SelectableCard({
  title,
  icon,
  subtitle,
  selected,
  onPress,
  accessibilityHint,
  role = 'radio',
}: SelectableCardProps) {
  const { color, shadow } = useTheme();

  return (
    <Pressable
      accessible
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      {...selectionKeyboardProps(onPress)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? color.surfaceAlt : color.surface,
          borderColor: selected ? color.accent : color.border,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.9 : 1,
        },
        shadow.sm,
      ]}
    >
      {icon ? (
        <View style={[styles.icon, { backgroundColor: color.surfaceAlt }]}>
          <Icon name={icon} size={26} color={color.accent} />
        </View>
      ) : null}
      <View
        style={[
          styles.marker,
          role === 'checkbox' && styles.checkboxMarker,
          { borderColor: selected ? color.accent : color.border },
          selected && { backgroundColor: color.accent },
        ]}
      >
        {role === 'checkbox' && selected ? (
          <Text variant="caption" tone="onAccent" style={styles.checkmark}>
            ✓
          </Text>
        ) : null}
      </View>
      <View style={styles.copy}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    minHeight: CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  marker: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMarker: {
    borderRadius: radius.sm,
  },
  checkmark: {
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '700',
  },
  copy: { flex: 1, gap: 2 },
});
