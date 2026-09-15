import { Linking, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { IngredientThumbnail } from '@/components/ui/IngredientChecklist';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { FOOD_IMAGE_CREDITS } from '@/data/food-images';
import { space } from '@/theme/tokens';

export default function ImageCreditsScreen() {
  return (
    <Screen header={<Header backLabel="Settings" fallbackHref="/settings" />}>
      <Text variant="title">Image credits</Text>
      <Text variant="body">
        Ingredient photos are references, not pictures of the finished recipe. Each photo keeps the
        license listed below. We use Wikimedia thumbnails, cropped to fit the display.
      </Text>
      <Text variant="caption" tone="muted">
        DecisionEats serving and pantry illustrations are original generated artwork. Meal-type
        defaults are shared examples, not photographs of individual recipes. Always follow the
        recipe ingredients and instructions.
      </Text>
      {FOOD_IMAGE_CREDITS.map((credit) => (
        <Card key={credit.key}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <IngredientThumbnail id={credit.ingredient_ids[0]!} />
            <View style={{ flex: 1, gap: space.xs }}>
              <Text variant="bodyStrong">{credit.title}</Text>
              <Text variant="caption">{credit.author}</Text>
            </View>
          </View>
          {credit.credit ? (
            <Text variant="caption" tone="muted">
              {credit.credit}
            </Text>
          ) : null}
          <Text
            variant="caption"
            tone="accent"
            accessibilityRole="link"
            accessibilityLabel={'Open original image: ' + credit.title}
            accessibilityHint="Opens the photographer and original file information in your browser"
            style={{ minHeight: 44, paddingVertical: 12 }}
            onPress={() => {
              void Linking.openURL(credit.source_url);
            }}
          >
            Original image and attribution
          </Text>
          <Text
            variant="caption"
            tone="accent"
            accessibilityRole="link"
            accessibilityLabel={'Read image license: ' + credit.license}
            accessibilityHint="Opens the terms for reusing this photograph"
            style={{ minHeight: 44, paddingVertical: 12 }}
            onPress={() => {
              void Linking.openURL(credit.license_url);
            }}
          >
            {credit.license}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
