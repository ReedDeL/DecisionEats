import { useRef, useState } from 'react';
import type { PointerEvent as RNPointerEvent } from 'react-native';
import { LayoutAnimation, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { Minutes } from '@/engine/types';
import { radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export interface TimeSliderOption {
  readonly minutes: Minutes;
  readonly label: string;
  readonly descriptor: string;
  readonly accessibilityLabel: string;
}

export const TIME_SLIDER_OPTIONS: readonly TimeSliderOption[] = [
  {
    minutes: 15,
    label: '15 min',
    descriptor: 'Quick meal · 15 min or less',
    accessibilityLabel: '15 minutes or less',
  },
  {
    minutes: 30,
    label: '30 min',
    descriptor: 'Standard prep · 30 min or less',
    accessibilityLabel: '30 minutes or less',
  },
  {
    minutes: 60,
    label: '60+ min',
    descriptor: 'Take your time · 60 minutes or more',
    accessibilityLabel: '60 minutes or more',
  },
];

export interface TimeSliderProps {
  value: Minutes;
  onChange: (minutes: Minutes) => void;
}

const THUMB_SIZE = 32;
const TRACK_HEIGHT = 8;
const TICK_SIZE = 12;

export function getClosestOptionIndex(minutes: Minutes): number {
  let closestIdx = 1;
  let minDiff = Infinity;
  for (let i = 0; i < TIME_SLIDER_OPTIONS.length; i++) {
    const opt = TIME_SLIDER_OPTIONS[i]!;
    const diff = Math.abs(opt.minutes - minutes);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx;
}

export function getClosestOptionIndexFromRatio(ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped < 0.25) return 0;
  if (clamped > 0.75) return 2;
  return 1;
}

export function getPercentForOptionIndex(index: number): number {
  if (index <= 0) return 0;
  if (index >= TIME_SLIDER_OPTIONS.length - 1) return 100;
  return (index / (TIME_SLIDER_OPTIONS.length - 1)) * 100;
}

export function TimeSlider({ value, onChange }: TimeSliderProps) {
  const { color, shadow } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);

  const containerRef = useRef<View>(null);
  const trackWidthRef = useRef(trackWidth);
  trackWidthRef.current = trackWidth;

  const isDraggingRef = useRef(isDragging);
  isDraggingRef.current = isDragging;

  const dragXRef = useRef(dragX);
  dragXRef.current = dragX;

  const valueRef = useRef(value);
  valueRef.current = value;

  const initialTouchXRef = useRef(0);
  const containerRectRef = useRef<{ left: number; width: number } | null>(null);

  const activeIndex = getClosestOptionIndex(value);
  const currentOption = TIME_SLIDER_OPTIONS[activeIndex] ?? TIME_SLIDER_OPTIONS[1]!;
  const percent = getPercentForOptionIndex(activeIndex);

  const usableWidth = Math.max(0, trackWidth - THUMB_SIZE);
  const activePercent =
    isDragging && usableWidth > 0
      ? Math.max(0, Math.min(100, (dragX / usableWidth) * 100))
      : percent;

  const updateFromPosition = (positionX: number, containerWidth?: number) => {
    const width = containerWidth ?? trackWidthRef.current;
    if (width <= THUMB_SIZE) return;
    const currentUsableWidth = width - THUMB_SIZE;
    const clamped = Math.max(0, Math.min(currentUsableWidth, positionX - THUMB_SIZE / 2));
    setDragX(clamped);
    dragXRef.current = clamped;

    const ratio = clamped / currentUsableWidth;
    const targetIndex = getClosestOptionIndexFromRatio(ratio);
    const nextOption = TIME_SLIDER_OPTIONS[targetIndex];
    if (nextOption && nextOption.minutes !== valueRef.current) {
      onChange(nextOption.minutes);
    }
  };

  const snapToNearest = (containerWidth?: number) => {
    setIsDragging(false);
    isDraggingRef.current = false;
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    const width = containerWidth ?? trackWidthRef.current;
    if (width > THUMB_SIZE) {
      const currentUsableWidth = width - THUMB_SIZE;
      const ratio = dragXRef.current / currentUsableWidth;
      const targetIndex = getClosestOptionIndexFromRatio(ratio);
      const nextOption = TIME_SLIDER_OPTIONS[targetIndex];
      if (nextOption && nextOption.minutes !== valueRef.current) {
        onChange(nextOption.minutes);
      }
    }
  };

  const handlePointerDown = (e: RNPointerEvent) => {
    const ne = e.nativeEvent;
    if (ne.button !== undefined && ne.button !== 0 && ne.pointerType === 'mouse') return;
    const target = e.currentTarget as unknown as HTMLElement;
    if (typeof target?.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(ne.pointerId);
      } catch {
        // ignore
      }
    }
    const rect = target.getBoundingClientRect();
    containerRectRef.current = { left: rect.left, width: rect.width };
    trackWidthRef.current = rect.width;
    setTrackWidth(rect.width);
    setIsDragging(true);
    isDraggingRef.current = true;

    const relativeX = ne.clientX - rect.left;
    updateFromPosition(relativeX, rect.width);
  };

  const handlePointerMove = (e: RNPointerEvent) => {
    if (!isDraggingRef.current) return;
    const rect = containerRectRef.current;
    if (!rect) return;
    const relativeX = e.nativeEvent.clientX - rect.left;
    updateFromPosition(relativeX, rect.width);
  };

  const handlePointerUp = (e: RNPointerEvent) => {
    if (!isDraggingRef.current) return;
    const target = e.currentTarget as unknown as HTMLElement;
    if (typeof target?.releasePointerCapture === 'function') {
      try {
        target.releasePointerCapture(e.nativeEvent.pointerId);
      } catch {
        // ignore
      }
    }
    const rect = containerRectRef.current;
    snapToNearest(rect?.width);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        isDraggingRef.current = true;
        const touchX = evt.nativeEvent.locationX;
        initialTouchXRef.current = touchX;
        updateFromPosition(touchX);
      },
      onPanResponderMove: (_evt, gestureState) => {
        const touchX = initialTouchXRef.current + gestureState.dx;
        updateFromPosition(touchX);
      },
      onPanResponderRelease: () => {
        snapToNearest();
      },
      onPanResponderTerminate: () => {
        snapToNearest();
      },
    })
  ).current;

  const handleIncrement = () => {
    if (activeIndex < TIME_SLIDER_OPTIONS.length - 1) {
      if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      onChange(TIME_SLIDER_OPTIONS[activeIndex + 1]!.minutes);
    }
  };

  const handleDecrement = () => {
    if (activeIndex > 0) {
      if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      onChange(TIME_SLIDER_OPTIONS[activeIndex - 1]!.minutes);
    }
  };

  const webAccessibilityProps =
    Platform.OS === 'web'
      ? ({
          tabIndex: 0,
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              handleIncrement();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              handleDecrement();
            } else if (e.key === 'Home') {
              e.preventDefault();
              onChange(TIME_SLIDER_OPTIONS[0]!.minutes);
            } else if (e.key === 'End') {
              e.preventDefault();
              onChange(TIME_SLIDER_OPTIONS[TIME_SLIDER_OPTIONS.length - 1]!.minutes);
            }
          },
        } as const)
      : {};

  const gestureProps =
    Platform.OS === 'web'
      ? {
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerUp,
        }
      : panResponder.panHandlers;

  const thumbLeftStyle = {
    left: `${activePercent}%` as const,
    marginLeft: -THUMB_SIZE * (activePercent / 100),
    ...(Platform.OS === 'web' && !isDragging
      ? {
          transition:
            'left 160ms cubic-bezier(0.2, 0.8, 0.2, 1), margin-left 160ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }
      : {}),
  };

  const fillWidthStyle = {
    width: `${activePercent}%` as const,
    ...(Platform.OS === 'web' && !isDragging
      ? {
          transition: 'width 160ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }
      : {}),
  };

  return (
    <Card variant="alt" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text variant="title" tone="accent">
            {currentOption.label}
          </Text>
        </View>
        <Text variant="caption" tone="muted" style={styles.descriptor}>
          {currentOption.descriptor}
        </Text>
      </View>

      <View
        ref={containerRef}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="How much time do you have?"
        accessibilityHint="Adjust to select between 15, 30, and 60+ minutes"
        accessibilityValue={{
          min: 15,
          max: 60,
          now: currentOption.minutes,
        }}
        aria-valuemin={15}
        aria-valuemax={60}
        aria-valuenow={currentOption.minutes}
        aria-valuetext={currentOption.accessibilityLabel}
        accessibilityActions={[
          { name: 'increment', label: 'Increase time' },
          { name: 'decrement', label: 'Decrease time' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') {
            handleIncrement();
          } else if (event.nativeEvent.actionName === 'decrement') {
            handleDecrement();
          }
        }}
        style={styles.sliderContainer}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...gestureProps}
        {...webAccessibilityProps}
      >
        {/* Track bar */}
        <View style={[styles.track, { backgroundColor: color.border }]}>
          {/* Active fill */}
          <View style={[styles.fill, fillWidthStyle, { backgroundColor: color.accent }]} />

          {/* Tick marks */}
          <View
            style={[
              styles.tick,
              styles.tickLeft,
              { backgroundColor: activeIndex >= 0 ? color.accent : color.surfaceAlt },
            ]}
          />
          <View
            style={[
              styles.tick,
              styles.tickCenter,
              { backgroundColor: activeIndex >= 1 ? color.accent : color.surfaceAlt },
            ]}
          />
          <View
            style={[
              styles.tick,
              styles.tickRight,
              { backgroundColor: activeIndex >= 2 ? color.accent : color.surfaceAlt },
            ]}
          />
        </View>

        {/* Thumb */}
        <View
          style={[
            styles.thumb,
            thumbLeftStyle,
            {
              backgroundColor: color.surface,
              borderColor: color.accent,
            },
            shadow.sm,
          ]}
        >
          <View style={[styles.thumbDot, { backgroundColor: color.accent }]} />
        </View>
      </View>

      {/* Discrete label buttons */}
      <View style={styles.labelsRow}>
        {TIME_SLIDER_OPTIONS.map((opt, idx) => {
          const isSelected = opt.minutes === currentOption.minutes;
          return (
            <Pressable
              key={opt.minutes}
              accessible
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={opt.accessibilityLabel}
              accessibilityHint="Selects this time limit"
              onPress={() => {
                if (Platform.OS !== 'web') {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                }
                onChange(opt.minutes);
              }}
              style={[
                styles.labelTarget,
                idx === 0
                  ? styles.labelStart
                  : idx === TIME_SLIDER_OPTIONS.length - 1
                    ? styles.labelEnd
                    : styles.labelCenter,
              ]}
            >
              <Text
                variant={isSelected ? 'bodyStrong' : 'caption'}
                tone={isSelected ? 'accent' : 'muted'}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  badge: {
    justifyContent: 'center',
  },
  descriptor: {
    textAlign: 'right',
  },
  sliderContainer: {
    height: touchTarget.standard,
    justifyContent: 'center',
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          userSelect: 'none',
          touchAction: 'none',
        } as const)
      : {}),
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.full,
    pointerEvents: 'none',
  },
  tick: {
    position: 'absolute',
    width: TICK_SIZE,
    height: TICK_SIZE,
    borderRadius: radius.full,
    top: -(TICK_SIZE - TRACK_HEIGHT) / 2,
    pointerEvents: 'none',
  },
  tickLeft: {
    left: 2,
  },
  tickCenter: {
    left: '50%',
    marginLeft: -TICK_SIZE / 2,
  },
  tickRight: {
    right: 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.full,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    top: (touchTarget.standard - THUMB_SIZE) / 2,
    pointerEvents: 'none',
  },
  thumbDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    pointerEvents: 'none',
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelTarget: {
    minHeight: touchTarget.standard,
    minWidth: 56,
    justifyContent: 'center',
  },
  labelStart: {
    alignItems: 'flex-start',
  },
  labelCenter: {
    alignItems: 'center',
  },
  labelEnd: {
    alignItems: 'flex-end',
  },
});
