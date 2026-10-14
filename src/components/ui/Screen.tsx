import type { PropsWithChildren, ReactNode } from 'react';
import { Animated, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useStepOpacity } from '@/lib/use-step-opacity';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getResponsiveLayout } from '@/components/ui/responsive-layout';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

interface ScreenProps extends PropsWithChildren {
  /**
   * Pinned to the top, outside the scroll area.
   */
  header?: ReactNode;
  /**
   * Pinned to the bottom, outside the scroll area. Onboarding's "Continue"
   * lives here so it never scrolls out of reach on a short phone.
   */
  footer?: ReactNode;
  /** Results manages its own scrolling per bucket; opt out here. */
  scroll?: boolean;
  transitionKey?: string;
}

/**
 * The frame every screen sits in: safe-area insets, background, page padding,
 * and optional pinned header and footer.
 *
 * Centralised so that a screen cannot accidentally ship without safe-area
 * handling — the failure mode is a title tucked under a notch, which is
 * invisible on a simulator with no notch and obvious on real hardware.
 */
export function Screen({ children, header, footer, scroll = true, transitionKey }: ScreenProps) {
  const opacity = useStepOpacity(transitionKey);
  const { color } = useTheme();
  const { width } = useWindowDimensions();
  const { horizontalPadding, contentMaxWidth } = getResponsiveLayout(
    Platform.OS === 'web' ? width : 0
  );
  const contentFrame =
    Platform.OS === 'web'
      ? ({ alignSelf: 'center', maxWidth: contentMaxWidth, width: '100%' } as const)
      : undefined;
  const horizontalInset = { paddingHorizontal: horizontalPadding };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: color.bg }]}
      edges={['top', 'bottom']}
    >
      {header ? <View style={[styles.header, contentFrame, horizontalInset]}>{header}</View> : null}

      {scroll ? (
        <Animated.ScrollView
          style={{ opacity }}
          contentContainerStyle={[styles.content, contentFrame, horizontalInset]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </Animated.ScrollView>
      ) : (
        <Animated.View
          style={[styles.content, styles.flex, contentFrame, horizontalInset, { opacity }]}
        >
          {children}
        </Animated.View>
      )}

      {footer ? (
        <View
          style={[
            styles.footer,
            contentFrame,
            horizontalInset,
            { borderTopColor: color.border, backgroundColor: color.bg },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  header: {
    paddingTop: space.xs,
    paddingBottom: space.xs,
  },
  content: {
    paddingVertical: space.lg,
    gap: space.lg,
  },
  footer: {
    paddingVertical: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
