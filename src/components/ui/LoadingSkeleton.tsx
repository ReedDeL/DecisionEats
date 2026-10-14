import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** Static by design: real asynchronous waits, no flashing or perpetual motion. */
export function LoadingSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  const { color } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityHint="Content will appear when loading finishes"
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={{ gap: space.sm }}
    >
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        style={{ gap: space.sm }}
      >
        {Array.from({ length: rows }, (_, index) => (
          <View
            key={index}
            style={{ height: 44, borderRadius: radius.md, backgroundColor: color.border }}
          />
        ))}
      </View>
    </View>
  );
}
