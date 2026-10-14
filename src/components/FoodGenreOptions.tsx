import { Chip } from '@/components/ui/Chip';
import { FOOD_GENRE_OPTIONS } from '@/lib/cuisines';

export function FoodGenreOptions({
  cuisine,
  onSelectCuisine,
}: {
  cuisine: string | null;
  onSelectCuisine: (cuisine: string | null) => void;
}) {
  return (
    <>
      <Chip
        label="Any"
        selected={cuisine === null}
        onPress={() => onSelectCuisine(null)}
        accessibilityLabel="Any food style"
        accessibilityHint="Removes the food-style preference"
      />
      {FOOD_GENRE_OPTIONS.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={cuisine === option.value}
          onPress={() => onSelectCuisine(cuisine === option.value ? null : option.value)}
          accessibilityLabel={option.label}
          accessibilityHint="Prefers this food style; any fallback is explained and keeps your safety needs"
        />
      ))}
    </>
  );
}
