import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { IconName, IconProps } from './Icon.types';

export type { IconName, IconProps } from './Icon.types';

const iconNames: Record<IconName, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  camera: 'camera-outline',
  meal: 'silverware-fork-knife',
  check: 'check',
  close: 'close',
  cog: 'cog-outline',
  'arrow-right': 'arrow-right',
  'arrow-left': 'arrow-left',
  swap: 'swap-horizontal',
  calendar: 'calendar-month-outline',
  pantry: 'fridge-outline',
  sunrise: 'weather-sunset-up',
  sun: 'white-balance-sunny',
  moon: 'moon-waning-crescent',
  produce: 'leaf',
  protein: 'food-drumstick-outline',
  dairy: 'cup-outline',
  'dry-pantry': 'package-variant-closed',
  seasoning: 'shaker-outline',
  ingredient: 'food-outline',
};

/** Shared Expo-compatible vector icons for controls and status affordances. */
export function Icon({ name, size = 24, color }: IconProps) {
  return (
    <MaterialCommunityIcons name={iconNames[name]} size={size} color={color} accessible={false} />
  );
}
