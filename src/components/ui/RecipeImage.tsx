import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp } from 'react-native';

import servingArt from '../../../assets/meal-art/servings.png';
import typeArt from '../../../assets/meal-art/meal-types.png';
import { MEAL_ART_COLUMNS, MEAL_ART_ROWS, MEAL_ART_TILES, mealArtTile } from '@/data/meal-art';
import { mealTypeArt } from '@/data/meal-type-art';
import { radius } from '@/theme/tokens';

export interface RecipeImageProps {
  uri?: string | null;
  recipeId?: string;
  title: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
}

/** Supplied photos, registered serving art, then a labeled meal-type default. */
export function RecipeImage({ uri, recipeId, title, size = 72, style }: RecipeImageProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [frame, setFrame] = useState({ width: size, height: size });
  const fallback = Object.hasOwn(MEAL_ART_TILES, recipeId ?? '')
    ? undefined
    : mealTypeArt(recipeId);
  const tile = fallback?.tile ?? mealArtTile(recipeId);
  const useTypeAtlas = fallback?.atlas === 'meal-types';
  const atlas = useTypeAtlas ? typeArt : servingArt;
  const columns = useTypeAtlas ? 3 : MEAL_ART_COLUMNS;
  const rows = useTypeAtlas ? 3 : MEAL_ART_ROWS;
  const tileSize = Math.max(frame.width, frame.height);
  const photoUri = uri?.trim();
  const showPhoto = Boolean(photoUri && failedUri !== photoUri);

  return (
    <View
      testID="recipe-image"
      accessible={false}
      onLayout={({ nativeEvent: { layout } }) => {
        if (layout.width > 0 && layout.height > 0) {
          setFrame((current) =>
            current.width === layout.width && current.height === layout.height
              ? current
              : { width: layout.width, height: layout.height }
          );
        }
      }}
      style={[styles.thumbnail, { width: size, height: size }, style]}
    >
      <Image
        source={typeof atlas === 'string' ? { uri: atlas } : atlas}
        resizeMode="stretch"
        accessibilityLabel={
          fallback ? fallback.label + ' illustration' : 'Serving illustration for ' + title
        }
        accessibilityHint="Illustrative meal type only; follow the recipe ingredients"
        accessible={false}
        accessibilityIgnoresInvertColors
        style={{
          position: 'absolute',
          width: tileSize * columns,
          height: tileSize * rows,
          left: -(tile % columns) * tileSize + (frame.width - tileSize) / 2,
          top: -Math.floor(tile / columns) * tileSize + (frame.height - tileSize) / 2,
        }}
      />
      {!showPhoto && fallback ? (
        <Text accessible={false} numberOfLines={1} style={styles.previewLabel}>
          {frame.width < 160 ? 'Illustration' : fallback.label + ' · Illustration'}
        </Text>
      ) : null}
      {showPhoto ? (
        <Image
          source={{ uri: photoUri! }}
          onError={() => setFailedUri(photoUri!)}
          accessibilityLabel={title}
          accessibilityHint={'Photo of ' + title}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnail: { borderRadius: radius.md, overflow: 'hidden' },
  previewLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 5,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.75)',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
});
