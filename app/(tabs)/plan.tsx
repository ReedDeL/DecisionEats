import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { ActionButton } from '@/components/ui/ActionButton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { RecipeImage } from '@/components/ui/RecipeImage';
import { Screen } from '@/components/ui/Screen';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SettingsAction } from '@/components/ui/SettingsAction';
import { Text } from '@/components/ui/Text';
import { MEAL_SLOTS, MEAL_SLOT_LABELS, type MealSlot } from '@/contracts/meal-slots';
import { weeklyMealPlanSchema, type WeeklyMealPlan } from '@/contracts/meal-journeys';
import { BUNDLED_CATALOG, lookupIngredient } from '@/data/catalog';
import {
  getPlanGroceryNeedMealNames,
  recomputePlanGroceryNeeds,
} from '@/engine/plan-grocery-needs';
import { createPlanProposal, type PlanPrepStyle } from '@/engine/plan-proposal';
import { isHardSafePlanRecipe, swapPlanMeal, type PlanWeekInput } from '@/engine/plan-week';
import type { DailyPlanPreference } from '@/engine/types';
import { formatDuration, formatFriendlyDate } from '@/lib/format';
import { syncMealPrepReminders } from '@/lib/meal-prep-notifications';
import { toMealPrepReminderEntries } from '@/lib/meal-prep-reminder-view';
import type { MealPrepReminderLeadMinutes } from '@/lib/meal-prep-reminder';
import { buildWeekDays } from '@/lib/plan-week-days';
import { toEnginePreferences, useKitchenStore } from '@/store/kitchen';
import { radius, space } from '@/theme/tokens';

type Step = 'days' | 'slots' | 'style' | 'variety' | 'proposal' | 'grocery';
type Days = 3 | 5 | 7;
type PrepStyle = PlanPrepStyle;
type Variety = 'variety' | 'repeats';

const DAYS_OPTIONS = [
  { value: 3 as Days, title: '3 days', subtitle: 'A short reset' },
  { value: 5 as Days, title: '5 days', subtitle: 'Most of the work week' },
  { value: 7 as Days, title: '7 days', subtitle: 'The full week' },
] as const;

const MEAL_SLOT_OPTIONS = [
  {
    value: 'breakfast' as MealSlot,
    title: 'Breakfast',
    subtitle: 'Start the day with a planned meal',
  },
  { value: 'lunch' as MealSlot, title: 'Lunch', subtitle: 'Midday meals ready to go' },
  { value: 'dinner' as MealSlot, title: 'Dinner', subtitle: 'Evening cooking for the household' },
] as const;

const STYLE_OPTIONS = [
  { value: 'quick' as PrepStyle, title: 'Mostly quick', subtitle: 'Keep weeknight cooking light' },
  { value: 'batch' as PrepStyle, title: 'Batch prep', subtitle: 'Make a little more up front' },
  {
    value: 'balanced' as PrepStyle,
    title: 'A balanced mix',
    subtitle: 'Some quick meals, some prep ahead',
  },
] as const;

const VARIETY_OPTIONS = [
  { value: 'variety' as Variety, title: 'More variety', subtitle: 'Try a different meal each day' },
  {
    value: 'repeats' as Variety,
    title: 'Comfortable repeats',
    subtitle: 'Reuse favorites and ingredients',
  },
] as const;

export default function PlanScreen() {
  const router = useRouter();
  const equipment = useKitchenStore((state) => state.equipment);
  const allergens = useKitchenStore((state) => state.allergens);
  const dietary = useKitchenStore((state) => state.dietary);
  const pantry = useKitchenStore((state) => state.pantry);
  const dislikedRecipes = useKitchenStore((state) => state.dislikedRecipes);
  const bodyGoal = useKitchenStore((state) => state.bodyGoal);
  const bodyMetrics = useKitchenStore((state) => state.bodyMetrics);
  const planTasteSignals = useKitchenStore((state) => state.planTasteSignals);
  const weeklyPlan = useKitchenStore((state) => state.weeklyPlan);
  const checkedNeeds = useKitchenStore((state) => state.checkedPlanGroceryNeeds);
  const setWeeklyPlan = useKitchenStore((state) => state.setWeeklyPlan);
  const recordConfirmedPlanSelections = useKitchenStore(
    (state) => state.recordConfirmedPlanSelections
  );
  const toggleNeed = useKitchenStore((state) => state.togglePlanGroceryNeed);
  const addPantryItems = useKitchenStore((state) => state.addPantryItems);
  const clearPlanGroceryChecks = useKitchenStore((state) => state.clearPlanGroceryChecks);
  const remindersEnabled = useKitchenStore((state) => state.mealPrepRemindersEnabled);
  const leadMinutes = useKitchenStore((state) => state.mealPrepReminderLeadMinutes);

  const [step, setStep] = useState<Step>(weeklyPlan?.status === 'confirmed' ? 'grocery' : 'days');
  const [days, setDays] = useState<Days>(7);
  const [mealSlots, setMealSlots] = useState<MealSlot[]>(['dinner']);
  const [prepStyle, setPrepStyle] = useState<PrepStyle>('balanced');
  const [variety, setVariety] = useState<Variety>('variety');
  const [proposal, setProposal] = useState<WeeklyMealPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const generationLock = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const preferences = useMemo(
    () => toEnginePreferences({ equipment, allergens, dietary, dislikedRecipes, bodyGoal }, null),
    [equipment, allergens, dietary, dislikedRecipes, bodyGoal]
  );
  const pantrySet = useMemo(() => new Set(pantry), [pantry]);
  const currentPlan = step === 'proposal' ? proposal : weeklyPlan;

  const addCheckedNeedsToPantry = () => {
    if (!currentPlan || checkedNeeds.length === 0) return;
    const nextPantry = new Set([...pantry, ...checkedNeeds]);
    const nextPlan = recomputePlanGroceryNeeds(currentPlan, BUNDLED_CATALOG, nextPantry);
    addPantryItems(checkedNeeds);
    if (nextPlan.status === 'confirmed') setWeeklyPlan(nextPlan);
    else setProposal(nextPlan);
    clearPlanGroceryChecks();
  };

  useEffect(() => {
    void syncReminders(
      weeklyPlan?.status === 'confirmed' ? weeklyPlan : null,
      remindersEnabled,
      leadMinutes
    );
  }, [weeklyPlan, remindersEnabled, leadMinutes]);

  const toggleMealSlot = (slot: MealSlot) => {
    setMealSlots((current) => {
      const next = current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot];
      return MEAL_SLOTS.filter((s) => next.includes(s));
    });
  };

  const handleBuildPlan = async () => {
    if (generationLock.current || mealSlots.length === 0) return;
    generationLock.current = true;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      // Yield a frame so the busy state paints before the synchronous engine runs.
      await new Promise<void>((resolve) => setTimeout(resolve, 32));
      const weekDays = buildWeekDays(prepStyle, new Date(), mealSlots, days);
      const plan = createPlanProposal({
        recipes: BUNDLED_CATALOG,
        pantry: pantrySet,
        preferences,
        days,
        weekDays,
        prepStyle,
        variety,
        tasteSignals: planTasteSignals,
        bodyProfile: null,
        bodyMetrics,
        bodyGoal,
      });
      setProposal(plan);
      setStep('proposal');
    } catch (error: unknown) {
      console.warn('[plan] Unable to generate weekly plan', error);
      setErrorMessage('Couldn’t build a plan. Try again after checking your kitchen setup.');
    } finally {
      generationLock.current = false;
      setIsGenerating(false);
    }
  };

  const confirm = async () => {
    if (!proposal) return;
    if (
      proposal.entries.some((entry) => {
        if (entry.kind !== 'recipe') return false;
        const recipe = BUNDLED_CATALOG.find((item) => item.id === entry.recipeId);
        return !recipe || !isHardSafePlanRecipe(recipe, preferences);
      })
    ) {
      setErrorMessage(
        'Your kitchen preferences changed. Build a new plan to keep every meal suitable.'
      );
      return;
    }
    const confirmed = weeklyMealPlanSchema.parse({ ...proposal, status: 'confirmed' });
    recordConfirmedPlanSelections(
      confirmed.entries.flatMap((entry) => (entry.kind === 'recipe' ? [entry.recipeId] : []))
    );
    setWeeklyPlan(confirmed);
    setStep('grocery');
  };

  const startOver = () => {
    setProposal(null);
    setErrorMessage(null);
    setStep('days');
  };

  const swap = (date: string, mealSlot: MealSlot) => {
    if (!currentPlan) return;
    const key = `${date}:${mealSlot}`;
    setErrorMessage(null);
    const defaults = buildWeekDays(
      prepStyle,
      new Date(`${currentPlan.weekStart}T12:00:00`),
      currentPlan.mealSlots,
      currentPlan.dayCount
    );
    const daysInput: DailyPlanPreference[] = currentPlan.entries.map((entry) => ({
      date: entry.date,
      mealSlot: entry.mealSlot,
      selectedLimit: prepStyle === 'quick' ? 30 : prepStyle === 'batch' ? 120 : 60,
      mealTime:
        entry.kind === 'recipe'
          ? entry.plannedMealTime.slice(11)
          : defaults.find((day) => day.date === entry.date && day.mealSlot === entry.mealSlot)!
              .mealTime,
    }));

    const planInput: PlanWeekInput = {
      recipes: BUNDLED_CATALOG,
      pantry: pantrySet,
      preferences,
      days: daysInput,
      variety,
      tasteSignals: planTasteSignals,
      portionInput: {
        bodyProfile: null,
        bodyMetrics,
        bodyGoal,
        satietyLevel: null,
      },
    };

    let next: WeeklyMealPlan | null;
    try {
      next = swapPlanMeal(currentPlan, key, planInput);
    } catch {
      setErrorMessage('Couldn’t replace this meal. Your plan is unchanged; please try again.');
      return;
    }
    if (!next) {
      setErrorMessage('No safe replacement found. Your plan is unchanged.');
      return;
    }

    if (next.status === 'confirmed') {
      setWeeklyPlan(next);
    } else {
      setProposal(next);
    }
  };

  const handleBack = () => {
    if (step === 'days') {
      if (weeklyPlan?.status === 'confirmed') setStep('grocery');
      else router.back();
    } else if (step === 'slots') setStep('days');
    else if (step === 'style') setStep('slots');
    else if (step === 'variety') setStep('style');
  };

  if (step === 'grocery' && currentPlan) {
    return (
      <PlanSummary
        plan={currentPlan}
        pantry={pantrySet}
        checkedNeeds={checkedNeeds}
        onToggleNeed={toggleNeed}
        onAddChecked={addCheckedNeedsToPantry}
        onSwap={swap}
        onStartOver={startOver}
        remindersEnabled={remindersEnabled}
        errorMessage={errorMessage}
      />
    );
  }

  if (step === 'proposal' && proposal) {
    return (
      <PlanSummary
        plan={proposal}
        pantry={pantrySet}
        checkedNeeds={checkedNeeds}
        onToggleNeed={toggleNeed}
        onAddChecked={addCheckedNeedsToPantry}
        onSwap={swap}
        onConfirm={confirm}
        onStartOver={startOver}
        remindersEnabled={false}
        errorMessage={errorMessage}
      />
    );
  }

  const currentQuestionStep: 'days' | 'slots' | 'style' | 'variety' =
    step === 'slots' || step === 'style' || step === 'variety' ? step : 'days';

  return (
    <PlanStep
      step={currentQuestionStep}
      days={days}
      mealSlots={mealSlots}
      prepStyle={prepStyle}
      variety={variety}
      isGenerating={isGenerating}
      errorMessage={errorMessage}
      onDays={setDays}
      onToggleMealSlot={toggleMealSlot}
      onStyle={setPrepStyle}
      onVariety={setVariety}
      onBuildPlan={handleBuildPlan}
      onNext={() => {
        if (step === 'days') setStep('slots');
        else if (step === 'slots') setStep('style');
        else if (step === 'style') setStep('variety');
      }}
      onBack={handleBack}
    />
  );
}

function PlanStep({
  step,
  days,
  mealSlots,
  prepStyle,
  variety,
  isGenerating,
  errorMessage,
  onDays,
  onToggleMealSlot,
  onStyle,
  onVariety,
  onBuildPlan,
  onNext,
  onBack,
}: {
  step: 'days' | 'slots' | 'style' | 'variety';
  days: Days;
  mealSlots: MealSlot[];
  prepStyle: PrepStyle;
  variety: Variety;
  isGenerating: boolean;
  errorMessage: string | null;
  onDays: (value: Days) => void;
  onToggleMealSlot: (slot: MealSlot) => void;
  onStyle: (value: PrepStyle) => void;
  onVariety: (value: Variety) => void;
  onBuildPlan: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const stepConfig = {
    days: {
      number: 1,
      heading: 'How many days should we plan?',
      hint: 'Choose the length of your weekly plan',
    },
    slots: {
      number: 2,
      heading: 'Which meals should be planned?',
      hint: 'Choose breakfast, lunch, dinner, or a combination',
    },
    style: {
      number: 3,
      heading: 'How should the week feel?',
      hint: 'Choose your weekly preparation style',
    },
    variety: {
      number: 4,
      heading: 'How much variety do you want?',
      hint: 'Choose between wide variety or comfortable repeats',
    },
  }[step];

  const footerAction =
    step === 'variety' ? (
      <PrimaryButton
        label={isGenerating ? 'Building your week…' : 'Build my plan'}
        icon="calendar"
        loading={isGenerating}
        onPress={onBuildPlan}
        accessibilityHint="Builds your personalized weekly meal plan"
        disabled={isGenerating || !variety}
      />
    ) : (
      <PrimaryButton
        label="Next"
        icon="arrow-right"
        onPress={onNext}
        disabled={step === 'slots' ? mealSlots.length === 0 : false}
        accessibilityHint="Continues to the next planning question"
      />
    );

  return (
    <Screen
      header={
        <Header
          onBack={onBack}
          backLabel="Back"
          backAccessibilityLabel="Back"
          backHint="Returns to the previous planning question"
          rightAction={
            <Text variant="caption" tone="muted">
              Step {stepConfig.number} of 4
            </Text>
          }
        />
      }
      footer={footerAction}
    >
      <View style={styles.header}>
        <Text variant="display">Plan my week</Text>
        <Text variant="body" tone="muted">
          {stepConfig.heading}
        </Text>
      </View>

      {errorMessage ? (
        <Text accessibilityRole="alert" variant="body">
          {errorMessage}
        </Text>
      ) : null}
      {step === 'days' && (
        <View
          style={styles.group}
          accessibilityRole="radiogroup"
          accessibilityLabel={stepConfig.heading}
          accessibilityHint={stepConfig.hint}
        >
          {DAYS_OPTIONS.map((option) => (
            <SelectableCard
              key={String(option.value)}
              title={option.title}
              subtitle={option.subtitle}
              selected={option.value === days}
              onPress={() => onDays(option.value)}
              accessibilityHint="Selects this number of days"
              role="radio"
            />
          ))}
        </View>
      )}

      {step === 'slots' && (
        <View
          style={styles.group}
          accessibilityLabel={stepConfig.heading}
          accessibilityHint={stepConfig.hint}
        >
          {MEAL_SLOT_OPTIONS.map((option) => (
            <SelectableCard
              key={option.value}
              title={option.title}
              subtitle={option.subtitle}
              selected={mealSlots.includes(option.value)}
              onPress={() => onToggleMealSlot(option.value)}
              icon={
                option.value === 'breakfast' ? 'sunrise' : option.value === 'lunch' ? 'sun' : 'moon'
              }
              accessibilityHint="Toggles this meal slot"
              role="checkbox"
            />
          ))}
        </View>
      )}

      {step === 'style' && (
        <View
          style={styles.group}
          accessibilityRole="radiogroup"
          accessibilityLabel={stepConfig.heading}
          accessibilityHint={stepConfig.hint}
        >
          {STYLE_OPTIONS.map((option) => (
            <SelectableCard
              key={option.value}
              title={option.title}
              subtitle={option.subtitle}
              selected={option.value === prepStyle}
              onPress={() => onStyle(option.value)}
              accessibilityHint="Selects this preparation style"
              role="radio"
            />
          ))}
        </View>
      )}

      {step === 'variety' && (
        <View
          style={styles.group}
          accessibilityRole="radiogroup"
          accessibilityLabel={stepConfig.heading}
          accessibilityHint={stepConfig.hint}
        >
          {VARIETY_OPTIONS.map((option) => (
            <SelectableCard
              key={option.value}
              title={option.title}
              subtitle={option.subtitle}
              selected={option.value === variety}
              onPress={() => onVariety(option.value)}
              accessibilityHint="Selects this variety preference"
              role="radio"
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function PlanSummary({
  plan,
  pantry,
  checkedNeeds,
  onToggleNeed,
  onAddChecked,
  onSwap,
  onConfirm,
  onStartOver,
  remindersEnabled,
  errorMessage,
}: {
  plan: WeeklyMealPlan;
  pantry: ReadonlySet<string>;
  checkedNeeds: readonly string[];
  onToggleNeed: (id: string) => void;
  onAddChecked: () => void;
  onSwap: (date: string, mealSlot: MealSlot) => void;
  onConfirm?: () => void;
  onStartOver: () => void;
  remindersEnabled: boolean;
  errorMessage: string | null;
}) {
  const router = useRouter();

  const { width } = useWindowDimensions();
  const desktop = width >= 960;
  const groupedEntries = useMemo(() => {
    const map = new Map<string, (typeof plan.entries)[number][]>();
    for (const entry of plan.entries) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    return Array.from(map.entries()).map(([date, entries]) => ({
      date,
      friendlyDate: formatFriendlyDate(date),
      entries,
    }));
  }, [plan.entries]);

  return (
    <Screen
      header={
        <Header
          onBack={onStartOver}
          backLabel="Change plan"
          backAccessibilityLabel="Change weekly plan"
          backHint="Changes your choices while keeping your saved plan until you confirm"
          rightAction={
            <SettingsAction
              onPress={() => router.push('/settings')}
              accessibilityHint="Opens settings for reminder preferences"
            />
          }
        />
      }
      footer={
        plan.status === 'draft' ? (
          <PrimaryButton
            label="Use this plan"
            icon="check"
            onPress={onConfirm ?? (() => undefined)}
            accessibilityHint="Confirms this week and derives its What to get ingredients"
          />
        ) : undefined
      }
    >
      <View style={styles.header}>
        <Text variant="display">
          {plan.status === 'confirmed' ? 'Your week' : 'Your proposed week'}
        </Text>
        <Text variant="body" tone="muted">
          {plan.status === 'confirmed'
            ? 'Your plan is saved. Here is everything it needs.'
            : 'One practical week, using the kitchen and pantry you already have.'}
        </Text>
      </View>

      {errorMessage ? (
        <Text accessibilityRole="alert" variant="body">
          {errorMessage}
        </Text>
      ) : null}
      {plan.limitedVariety ? (
        <View>
          <Text variant="caption" tone="muted">
            Your pantry has a small match set, so a few meals repeat.
          </Text>
        </View>
      ) : null}

      <View style={[styles.group, desktop && styles.desktopDays]}>
        {groupedEntries.map((group) => (
          <View key={group.date} style={[styles.dateGroup, desktop && styles.desktopDay]}>
            <Text variant="bodyStrong">{group.friendlyDate}</Text>
            <View style={styles.group}>
              {group.entries.map((entry) => {
                const recipe =
                  entry.kind === 'recipe'
                    ? BUNDLED_CATALOG.find((candidate) => candidate.id === entry.recipeId)
                    : undefined;
                const missingCount = recipe
                  ? recipe.ingredients.filter((ingredient) => !pantry.has(ingredient.id)).length
                  : 0;
                const slotLabel = MEAL_SLOT_LABELS[entry.mealSlot];
                const accessibilityLabel =
                  entry.kind === 'recipe'
                    ? `${group.friendlyDate}, ${slotLabel}, ${recipe?.title ?? entry.recipeId}, ${recipe?.totalTimeMinutes ?? 0} minutes`
                    : `${group.friendlyDate}, ${slotLabel}, ${entry.reason === 'not_planned' ? 'Not planned' : 'Decide that day'}`;

                return (
                  <Card key={`${entry.date}:${entry.mealSlot}`} variant="alt">
                    <View
                      accessibilityLabel={accessibilityLabel}
                      accessibilityHint="Shows the planned meal, time, and pantry fit"
                      style={styles.mealRow}
                    >
                      <RecipeImage
                        recipeId={recipe?.id}
                        uri={recipe?.imageUrl}
                        title={recipe?.title ?? slotLabel}
                        size={80}
                      />
                      <View style={styles.mealCopy}>
                        <Text variant="caption" tone="accent">
                          {slotLabel}
                        </Text>
                        <Text variant="heading">
                          {entry.kind === 'recipe'
                            ? (recipe?.title ?? entry.recipeId)
                            : entry.reason === 'not_planned'
                              ? 'Not planned'
                              : 'Decide that day'}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {entry.kind === 'recipe'
                            ? `${recipe?.totalTimeMinutes ? `${formatDuration(recipe.totalTimeMinutes)} · ` : ''}${
                                missingCount === 0
                                  ? 'Ready from your pantry'
                                  : `${missingCount} ingredient${missingCount === 1 ? '' : 's'} to get`
                              }`
                            : entry.reason === 'not_planned'
                              ? 'Not planned'
                              : entry.reason === 'grocery_need_cap'
                                ? 'Kept open to keep your ingredient list manageable'
                                : 'No safe match for this meal'}
                        </Text>
                        {entry.kind === 'recipe' && entry.statedRelaxations.length > 0 ? (
                          <Text variant="caption" tone="muted">
                            {entry.statedRelaxations
                              .map((value) =>
                                value === 'time'
                                  ? 'Longer than your selected prep time'
                                  : 'Outside your preferred cuisine'
                              )
                              .join(' · ')}
                          </Text>
                        ) : null}
                        {entry.kind === 'recipe' && (
                          <ActionButton
                            style={{ alignSelf: 'flex-start', marginTop: space.sm }}
                            label="Swap"
                            icon="swap"
                            accessibilityLabel={`Replace ${slotLabel} on ${group.friendlyDate}`}
                            accessibilityHint="Replaces one meal without changing the rest of your plan"
                            onPress={() => onSwap(entry.date, entry.mealSlot)}
                          />
                        )}
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      {plan.status === 'confirmed' ? (
        <View style={styles.group}>
          <Text variant="heading">What to get</Text>
          <Text variant="caption" tone="muted">
            Only ingredients missing from your pantry, grouped across this plan.
          </Text>
          {plan.groceryNeeds.length === 0 ? (
            <Card variant="alt">
              <Text variant="body">You have everything this plan needs.</Text>
            </Card>
          ) : (
            plan.groceryNeeds.map((need) => {
              const name = lookupIngredient(need.ingredientId)?.displayName ?? need.ingredientId;
              const mealNames = getPlanGroceryNeedMealNames(need, BUNDLED_CATALOG);
              const checked = checkedNeeds.includes(need.ingredientId);
              return (
                <Pressable
                  key={need.ingredientId}
                  accessible
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={name + ', used in ' + mealNames.join(', ')}
                  accessibilityHint="Marks this ingredient as purchased"
                  onPress={() => onToggleNeed(need.ingredientId)}
                  style={styles.needRow}
                >
                  <Text variant="bodyStrong">
                    {checked ? '✓ ' : '○ '}
                    {name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {mealNames.join(', ')} · {need.dates.join(', ')}
                  </Text>
                </Pressable>
              );
            })
          )}
          {checkedNeeds.length > 0 ? (
            <PrimaryButton
              label="Add checked items to pantry"
              onPress={onAddChecked}
              accessibilityHint="Confirms purchased ingredients and adds them to your pantry"
            />
          ) : null}
          <PrimaryButton
            label="Open Reminders"
            variant="ghost"
            onPress={() => router.push('/reminders')}
            accessibilityHint="Opens reminders for this confirmed weekly plan"
          />
          {Platform.OS === 'web' ? (
            <Text variant="caption" tone="muted">
              Reminders are unavailable on the web. Your plan is still saved.
            </Text>
          ) : remindersEnabled ? (
            <Text variant="caption" tone="muted">
              Cooking reminders are scheduled from Settings.
            </Text>
          ) : (
            <Text variant="caption" tone="muted">
              Turn on reminders in Settings when you want cooking prompts.
            </Text>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

async function syncReminders(
  plan: WeeklyMealPlan | null,
  enabled: boolean,
  leadMinutes: MealPrepReminderLeadMinutes
) {
  const entries = toMealPrepReminderEntries(plan, BUNDLED_CATALOG);
  try {
    await syncMealPrepReminders(entries, { enabled, leadMinutes });
  } catch (error: unknown) {
    console.warn('[plan] Reminder sync failed; plan state is preserved', error);
  }
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
  group: { gap: space.sm },
  dateGroup: { gap: space.xs, marginTop: space.xs },
  desktopDays: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  desktopDay: { width: '48%', flexGrow: 1 },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mealCopy: { flex: 1, gap: 2 },
  swapButton: {
    minWidth: 64,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  needRow: {
    minHeight: 56,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#d8cec2',
  },
});
