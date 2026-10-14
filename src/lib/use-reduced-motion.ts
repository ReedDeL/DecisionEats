import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Start motion-free until the platform preference is known. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    let changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      changed = true;
      setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted && !changed) setReduced(value);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);
  return reduced;
}
