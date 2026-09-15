import { useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';

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

function getClosestOptionIndex(minutes: Minutes): number {
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

export function TimeSlider({ value, onChange }: TimeSliderProps) {
  const { color, shadow } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);

  const activeIndex = getClosestOptionIndex(value);
  const currentOption = TIME_SLIDER_OPTIONS[activeIndex] ?? TIME_SLIDER_OPTIONS[1]!;
  const percent = activeIndex === 0 ? 0 : activeIndex === 1 ? 50 : 100;

  const trackWidthRef = useRef(trackWidth);
  trackWidthRef.current = trackWidth;

  const initialTouchXRef = useRef(0);

  const updateFromPosition = (x: number) => {
    const width = trackWidthRef.current;
    if (width <= THUMB_SIZE) return;
    const usableWidth = width - THUMB_SIZE;
    const clamped = Math.max(0, Math.min(usableWidth, x - THUMB_SIZE / 2));
    setDragX(clamped);

    const ratio = clamped / usableWidth;
    let targetIndex = 1;
    if (ratio < 0.25) {
      targetIndex = 0;
    } else if (ratio < 0.75) {
      targetIndex = 1;
    } else {
      targetIndex = 2;
    }

    const nextOption = TIME_SLIDER_OPTIONS[targetIndex];
    if (nextOption && nextOption.minutes !== value) {
      onChange(nextOption.minutes);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        const touchX = evt.nativeEvent.locationX;
        initialTouchXRef.current = touchX;
        updateFromPosition(touchX);
      },
      onPanResponderMove: (evt, gestureState) => {
        const touchX = initialTouchXRef.current + gestureState.dx;
        updateFromPosition(touchX);
      },
      onPanResponderRelease: () => {
        setIsDragging(false);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
      },
    })
  ).current;

  const handleIncrement = () => {
    if (activeIndex < TIME_SLIDER_OPTIONS.length - 1) {
      onChange(TIME_SLIDER_OPTIONS[activeIndex + 1]!.minutes);
    }
  };

  const handleDecrement = () => {
    if (activeIndex > 0) {
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

  const thumbLeftStyle = isDragging
    ? { left: dragX }
    : {
        left: `${percent}%` as const,
        marginLeft: -THUMB_SIZE * (percent / 100),
      };

  const fillWidthStyle = isDragging
    ? { width: Math.max(0, dragX + THUMB_SIZE / 2) }
    : { width: `${percent}%` as const };

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
        {...panResponder.panHandlers}
        {...webAccessibilityProps}
      >
        {/* Track bar */}
        <View style={[styles.track, { backgroundColor: color.border, pointerEvents: 'none' }]}>
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
              pointerEvents: 'none',
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
              onPress={() => onChange(opt.minutes)}
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
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.full,
  },
  tick: {
    position: 'absolute',
    width: TICK_SIZE,
    height: TICK_SIZE,
    borderRadius: radius.full,
    top: -(TICK_SIZE - TRACK_HEIGHT) / 2,
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
  },
  thumbDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
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
