import { Icon } from '@/components/ui/Icon';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  type ListRenderItemInfo,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import { getIngredientPresentation } from '@/data/ingredient-presentation';
import { INGREDIENT_ART } from '@/data/ingredient-art';
import { foodImageSource, ingredientPhoto } from '@/data/food-images';
import { lookupIngredient } from '@/data/catalog';
import type { IngredientId } from '@/engine/types';
import { radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

interface IngredientChecklistProps {
  ids: readonly IngredientId[];
  selectedIds: readonly IngredientId[];
  onToggle: (id: IngredientId) => void;
  emptyMessage: string;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IngredientThumbnail({ id }: { id: IngredientId }) {
  const { color } = useTheme();
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = ingredientPhoto(id);
  const presentation = getIngredientPresentation(id);
  const artKey = (
    presentation.art in INGREDIENT_ART ? presentation.art : 'fallback'
  ) as keyof typeof INGREDIENT_ART;

  return (
    <View
      accessible={false}
      style={[styles.thumbnail, { backgroundColor: color.surfaceAlt, borderColor: color.border }]}
    >
      <Image source={INGREDIENT_ART[artKey]} style={styles.thumbnail} accessible={false} />
      {photo && failedPhoto !== photo.key ? (
        <Image
          source={foodImageSource(photo.key)}
          style={[StyleSheet.absoluteFill, styles.thumbnailPhoto]}
          resizeMode="cover"
          accessible={false}
          onError={() => setFailedPhoto(photo.key)}
        />
      ) : null}
    </View>
  );
}

/** A shared, virtualized ingredient checklist for Pantry Starter and Pantry. */
export function IngredientChecklist({
  ids,
  selectedIds,
  onToggle,
  emptyMessage,
  style,
  contentContainerStyle,
  testID,
}: IngredientChecklistProps) {
  const { color } = useTheme();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const renderItem = ({ item: id }: ListRenderItemInfo<IngredientId>) => {
    const entry = lookupIngredient(id);
    if (!entry) return null;
    const checked = selected.has(id);
    const presentation = getIngredientPresentation(id);
    const focused = focusedId === id;

    return (
      <Pressable
        accessible
        accessibilityRole="checkbox"
        accessibilityLabel={entry.displayName}
        accessibilityHint={
          checked ? 'Double tap to remove from your pantry' : 'Double tap to add to your pantry'
        }
        accessibilityState={{ checked }}
        aria-checked={checked}
        onPress={() => onToggle(id)}
        onFocus={() => setFocusedId(id)}
        onBlur={() => setFocusedId((current) => (current === id ? null : current))}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: checked ? color.surfaceAlt : color.surface,
            borderColor: focused ? color.accent : color.border,
            opacity: pressed ? 0.84 : 1,
          },
        ]}
      >
        <IngredientThumbnail id={id} />
        <View style={styles.copy}>
          <Text variant="bodyStrong">{entry.displayName}</Text>
          <Text variant="caption" tone="muted">
            {presentation.detail}
          </Text>
        </View>
        <View
          accessible={false}
          style={[
            styles.checkbox,
            {
              borderColor: checked ? color.accent : color.border,
              backgroundColor: checked ? color.accent : color.surface,
            },
          ]}
        >
          {checked ? <Icon name="check" size={18} color={color.accentText} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <FlatList
      testID={testID}
      data={[...ids]}
      renderItem={renderItem}
      keyExtractor={(id) => id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.list,
        ids.length === 0 && styles.emptyList,
        contentContainerStyle,
      ]}
      style={style}
      initialNumToRender={16}
      maxToRenderPerBatch={24}
      windowSize={7}
      ListEmptyComponent={
        <Text variant="caption" tone="muted">
          {emptyMessage}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm, paddingBottom: space.xl },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  row: {
    minHeight: touchTarget.standard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  thumbnail: {
    width: 44,
    height: 44,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailPhoto: { width: 44, height: 44, borderRadius: radius.sm },
  copy: { flex: 1, gap: space.xs },
  checkbox: {
    width: touchTarget.standard,
    height: touchTarget.standard,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
