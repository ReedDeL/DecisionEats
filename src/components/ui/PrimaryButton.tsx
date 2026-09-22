import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  accessibilityHint: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  /** Secondary actions ("I'll add them manually") share the size, not the fill. */
  variant?: 'primary' | 'secondary' | 'ghost';
  testID?: string;
}

/**
 * The primary call to action: full width, 56pt tall (spec §1.4).
 *
 * Full width is not decoration — it is the largest possible target for a tired
 * user holding the phone in one hand, which is the whole design premise.
 */
export function PrimaryButton({
  label,
  onPress,
  accessibilityHint,
  disabled = false,
  loading = false,
  icon,
  variant = 'primary',
  testID,
}: PrimaryButtonProps) {
  const { color } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isGhost = variant === 'ghost';
  const isSecondary = variant === 'secondary';
  const isBusy = loading;
  const foreground = isGhost || isSecondary ? color.text : color.accentText;

  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || isBusy, busy: isBusy }}
      aria-busy={isBusy}
      disabled={disabled || isBusy}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isGhost ? 'transparent' : isSecondary ? color.surface : color.accent,
          borderColor: isGhost ? color.border : color.accent,
          opacity: disabled || isBusy ? 0.45 : pressed ? 0.85 : hovered ? 0.92 : 1,
          ...(focused
            ? { borderWidth: 2, shadowColor: color.accent, shadowOpacity: 0.22, shadowRadius: 4 }
            : null),
        },
      ]}
    >
      {isBusy ? (
        <ActivityIndicator color={foreground} />
      ) : icon ? (
        <Icon name={icon} size={20} color={foreground} />
      ) : null}
      {
        <Text
          variant="bodyStrong"
          tone={isGhost || isSecondary ? 'default' : 'onAccent'}
          style={styles.label}
        >
          {label}
        </Text>
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { flexShrink: 1, textAlign: 'center' },
  button: {
    flexDirection: 'row',
    minHeight: touchTarget.primaryCtaHeight,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
