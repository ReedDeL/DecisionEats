import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import decisionEatsMark from '../../assets/brand/decisioneats-mark.png';

import { Text } from '@/components/ui/Text';
import { space } from '@/theme/tokens';

interface BrandLockupProps {
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The shared brand lockup. The image is decorative because the wordmark names the app. */
export function BrandLockup({ compact = false, style }: BrandLockupProps) {
  return (
    <View style={[styles.lockup, style]}>
      <Image
        accessible={false}
        source={decisionEatsMark}
        resizeMode="contain"
        style={compact ? styles.compactMark : styles.mark}
      />
      <Text
        accessibilityRole="header"
        variant={compact ? 'heading' : 'title'}
        style={styles.wordmark}
      >
        DecisionEats
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
  },
  mark: {
    width: 52,
    height: 52,
  },
  compactMark: {
    width: 36,
    height: 36,
  },
  wordmark: {
    letterSpacing: -0.6,
  },
});
