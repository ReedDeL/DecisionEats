import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CameraCapture } from '@/components/CameraCapture';
import { CandidateRow } from '@/components/ui/CandidateRow';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import type { VocabularyEntry } from '@/data/catalog';
import {
  MAX_PHOTOS,
  PantryPhotoError,
  acceptedIngredientIds,
  analyzePantryPhotos,
  correctCandidate,
  type PantryCandidate,
} from '@/lib/pantry-photo';
import { trackVisionScanFailed, trackVisionScanSucceeded } from '@/lib/analytics';
import { useKitchenStore } from '@/store/kitchen';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Phase = 'capture' | 'analyzing' | 'review';

/**
 * Photo → pantry, from the user's side (Technical Spec §5.1, UI/UX Spec §3.3).
 *
 * The screen is built around one assumption: the model will get some of this
 * wrong. So the scan never writes anything on its own. It proposes, the user
 * corrects, and only the confirmed list reaches the pantry — which is also the
 * cheapest moment to catch an error, because the alternative is discovering it
 * three days later as a recipe suggestion that makes no sense.
 */
export default function ScanScreen() {
  const router = useRouter();
  const { color } = useTheme();
  const addPantryItems = useKitchenStore((state) => state.addPantryItems);
  const onboardingDone = useKitchenStore((state) => state.onboardingDone);
  const fallbackHref = onboardingDone ? '/pantry' : '/(onboarding)/staples';

  const [phase, setPhase] = useState<Phase>('capture');
  const [uris, setUris] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<PantryCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const acceptedCount = useMemo(
    () => candidates.filter((candidate) => candidate.accepted && candidate.ingredientId).length,
    [candidates]
  );

  const pick = useCallback(async (source: 'camera' | 'library') => {
    setError(null);

    if (source === 'camera' && Platform.OS === 'web') {
      setCameraOpen(true);
      return;
    }

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('We need camera access to photograph your kitchen.');
        return;
      }
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            quality: 1,
            allowsMultipleSelection: true,
            selectionLimit: MAX_PHOTOS,
          });

    if (result.canceled) return;

    setUris((current) =>
      [...current, ...result.assets.map((asset) => asset.uri)].slice(0, MAX_PHOTOS)
    );
  }, []);

  const handleWebCapture = useCallback((dataUri: string) => {
    setCameraOpen(false);
    setUris((current) => [...current, dataUri].slice(0, MAX_PHOTOS));
  }, []);

  const handleWebCameraUnavailable = useCallback(() => {
    setCameraOpen(false);
    void pick('library');
  }, [pick]);

  const analyze = useCallback(async () => {
    setPhase('analyzing');
    setError(null);

    try {
      const result = await analyzePantryPhotos(uris);
      setCandidates(result);
      trackVisionScanSucceeded({
        photo_count: uris.length,
        candidate_count: result.length,
        accepted_count: acceptedIngredientIds(result).length,
      });
      setPhase('review');
    } catch (caught) {
      trackVisionScanFailed({ photo_count: uris.length, failure_stage: 'analyze' });
      // Manual entry is a complete fallback (§2.4), so a failure here is a
      // detour rather than a dead end — and it says so.
      setError(
        caught instanceof PantryPhotoError
          ? caught.message
          : 'We could not read those photos. You can still add ingredients by hand.'
      );
      setPhase('capture');
    }
  }, [uris]);

  const confirm = useCallback(() => {
    const acceptedIds = acceptedIngredientIds(candidates);
    addPantryItems(acceptedIds);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackHref as Parameters<typeof router.replace>[0]);
    }
  }, [candidates, addPantryItems, router, fallbackHref]);

  const updateCandidate = useCallback(
    (key: string, change: (candidate: PantryCandidate) => PantryCandidate) => {
      setCandidates((current) =>
        current.map((candidate) => (candidate.key === key ? change(candidate) : candidate))
      );
    },
    []
  );

  if (phase === 'review') {
    return (
      <Screen
        header={
          <Header
            backLabel="Photos"
            backHint="Returns to photo capture to add or retake photos"
            onBack={() => {
              setPhase('capture');
              setUris([]);
              setCandidates([]);
            }}
            fallbackHref={fallbackHref}
          />
        }
        footer={
          <View style={styles.footer}>
            <PrimaryButton
              label={acceptedCount === 0 ? 'Nothing selected' : `Add ${acceptedCount} to pantry`}
              onPress={confirm}
              disabled={acceptedCount === 0}
              accessibilityHint="Adds the ticked ingredients to your pantry"
            />
            <PrimaryButton
              label="Start over"
              variant="ghost"
              onPress={() => {
                setPhase('capture');
                setUris([]);
                setCandidates([]);
              }}
              accessibilityHint="Discards this scan"
            />
          </View>
        }
      >
        <View style={styles.intro}>
          <Text variant="display">Does this look right?</Text>
          <Text variant="body" tone="muted">
            Tick what you actually have. We flagged the ones we&apos;re unsure about.
          </Text>
        </View>

        {candidates.length === 0 ? (
          <Card variant="alt">
            <Text variant="heading">We didn&apos;t spot any ingredients.</Text>
            <Text variant="body" tone="muted">
              Try a closer photo with the door open, or add what you have by hand.
            </Text>
          </Card>
        ) : (
          candidates.map((candidate) => (
            <CandidateRow
              key={candidate.key}
              candidate={candidate}
              onToggle={(key) => updateCandidate(key, (c) => ({ ...c, accepted: !c.accepted }))}
              onCorrect={(key, entry: VocabularyEntry) =>
                updateCandidate(key, (c) => correctCandidate(c, entry.id, entry.displayName))
              }
              onDismiss={(key) => setCandidates((current) => current.filter((c) => c.key !== key))}
            />
          ))
        )}
      </Screen>
    );
  }

  return (
    <>
      <Screen
        header={
          <Header
            backLabel="Back"
            backHint="Returns to previous screen"
            fallbackHref={fallbackHref}
          />
        }
        footer={
          <View style={styles.footer}>
            <PrimaryButton
              label={phase === 'analyzing' ? 'Reading your photos…' : 'Read my photos'}
              onPress={analyze}
              disabled={uris.length === 0 || phase === 'analyzing'}
              accessibilityHint="Sends the photos to be read for ingredients"
            />
            <PrimaryButton
              label="I'll add them manually"
              variant="ghost"
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace(fallbackHref as Parameters<typeof router.replace>[0]);
                }
              }}
              accessibilityHint={onboardingDone ? 'Returns to the pantry' : 'Returns to setup'}
            />
          </View>
        }
      >
        <View style={styles.intro}>
          <Text variant="display">Take a photo of your fridge</Text>
          <Text variant="body" tone="muted">
            Open the door and get the shelves in frame. You can add up to {MAX_PHOTOS} photos —
            fridge, freezer, cupboard.
          </Text>
        </View>

        <Card variant="alt">
          <Text variant="bodyStrong">Photo safety</Text>
          <Text variant="caption" tone="muted">
            Photos are sent to a third-party photo-recognition provider for this request.
            DecisionEats does not save the photos after the request, but the provider&apos;s
            data-handling terms apply. Do not include people, documents, or personal details. Always
            review the results: this feature is not medical or allergy-safety advice.
          </Text>
        </Card>

        {error ? (
          <Card variant="alt">
            <Text variant="body" tone="near">
              {error}
            </Text>
          </Card>
        ) : null}

        <View style={styles.pickRow}>
          <PrimaryButton
            label="Take a photo"
            onPress={() => pick('camera')}
            accessibilityHint="Opens the camera"
          />
          <PrimaryButton
            label="Choose from library"
            variant="ghost"
            onPress={() => pick('library')}
            accessibilityHint="Opens your photo library"
          />
        </View>

        {uris.length > 0 ? (
          <View style={styles.group}>
            <Text variant="heading">
              {uris.length} {uris.length === 1 ? 'photo' : 'photos'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbRow}
            >
              {uris.map((uri, index) => (
                <Pressable
                  key={index}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Remove this photo"
                  accessibilityHint="Drops the photo from this scan"
                  onPress={() => setUris((current) => current.filter((_, i) => i !== index))}
                >
                  <Image
                    source={{ uri }}
                    style={[styles.thumb, { borderColor: color.border }]}
                    accessibilityIgnoresInvertColors
                  />
                </Pressable>
              ))}
            </ScrollView>
            <Text variant="caption" tone="muted">
              Tap a photo to remove it. DecisionEats does not save photos after the request; only
              the ingredients you confirm continue into your pantry.
            </Text>
          </View>
        ) : null}
      </Screen>

      <CameraCapture
        visible={cameraOpen}
        onCapture={handleWebCapture}
        onClose={() => setCameraOpen(false)}
        onUnavailable={handleWebCameraUnavailable}
      />
    </>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
  group: { gap: space.sm },
  footer: { gap: space.sm },
  pickRow: { gap: space.sm },
  thumbRow: { flexDirection: 'row', gap: space.sm },
  thumb: { width: 96, height: 96, borderRadius: radius.md, borderWidth: 1 },
});
