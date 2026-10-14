import { useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { Text } from '@/components/ui/Text';
import { foodImageSource, mealPhoto } from '@/data/food-images';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export interface RecipeImageProps {
  /** Unreviewed remote URLs cannot bypass the reviewed asset registry. */
  uri?: string | null;
  recipeId?: string;
  title: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
}

/** Reviewed real meal photographs only, with a neutral fallback. */
export function RecipeImage({ recipeId, title, size = 72, style }: RecipeImageProps) {
  const { color } = useTheme();
  const credit = mealPhoto(recipeId);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const source = credit && credit.key !== failedKey ? foodImageSource(credit.key) : undefined;
  return (
    <View
      testID="recipe-image"
      style={[
        styles.frame,
        { width: size, height: size, backgroundColor: color.surfaceAlt },
        style,
      ]}
    >
      {source ? (
        <Image
          source={source}
          resizeMode="cover"
          style={styles.image}
          accessibilityLabel={`Representative serving of ${title}`}
          accessibilityHint="See Image credits in Settings for the source and license"
          accessibilityIgnoresInvertColors
          onError={() => setFailedKey(credit!.key)}
        />
      ) : (
        <Text variant="caption" tone="muted" style={{ padding: space.sm }}>
          Meal photo unavailable
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { borderRadius: radius.md, overflow: 'hidden', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
});
