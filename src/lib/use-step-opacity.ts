import { useEffect, useRef } from 'react';
import { Animated, Platform } from 'react-native';
import { useReducedMotion } from '@/lib/use-reduced-motion';

/** A brief fade never hides controls or delays engine work. */
export function useStepOpacity(step: string | undefined) {
  const opacity = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    opacity.stopAnimation();
    opacity.setValue(1);
    if (reduced || step === undefined) return;
    opacity.setValue(0.86);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, reduced, step]);
  return opacity;
}
