export type IconName =
  | 'camera'
  | 'check'
  | 'close'
  | 'cog'
  | 'meal'
  | 'arrow-right'
  | 'arrow-left'
  | 'swap'
  | 'calendar'
  | 'pantry'
  | 'sunrise'
  | 'sun'
  | 'moon'
  | 'produce'
  | 'protein'
  | 'dairy'
  | 'dry-pantry'
  | 'seasoning'
  | 'ingredient';

export interface IconProps {
  name: IconName;
  size?: number;
  color: string;
}
