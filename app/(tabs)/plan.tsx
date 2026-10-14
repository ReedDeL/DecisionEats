import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { ActionButton } from '@/components/ui/ActionButton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { SelectableCard } from '@/components/ui/SelectableCard';
import { SettingsAction } from '@/components/ui/SettingsAction';
import { PlanReplacementPicker } from '@/components/PlanReplacementPicker';
import { FoodGenreOptions } from '@/components/FoodGenreOptions';
import { Text } from '@/components/ui/Text';
import { MEAL_SLOTS, MEAL_SLOT_LABELS, type MealSlot } from '@/contracts/meal-slots';
import { weeklyMealPlanSchema, type WeeklyMealPlan } from '@/contracts/meal-journeys';
import { BUNDLED_CATALOG, lookupIngredient } from '@/data/catalog';
import {
  derivePlanLinkedGroceryPreview,
  getMissingPlanIngredientIds,
  getPlanGroceryEntries,
  getPlanGroceryNeedMealNames,
  recomputePlanGroceryNeeds,
} from '@/engine/plan-grocery-needs';
import { createPlanProposal, type PlanPrepStyle } from '@/engine/plan-proposal';
import {
  getPlanMealReplacements,
  isHardSafePlanRecipe,
  swapPlanMeal,
  type PlanWeekInput,
} from '@/engine/plan-week';
import type { DailyPlanPreference } from '@/engine/types';
import { formatDuration, formatFriendlyDate } from '@/lib/format';
import { syncMealPrepReminders } from '@/lib/meal-prep-notifications';
import { toMealPrepReminderEntries } from '@/lib/meal-prep-reminder-view';
import type { MealPrepReminderLeadMinutes } from '@/lib/meal-prep-reminder';
import { buildWeekDays, defaultPlanMealTime } from '@/lib/plan-week-days';
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
  const skippedRecipes = useKitchenStore((state) => state.skippedRecipes);
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
  const [weekCuisine, setWeekCuisine] = useState<string | null>(null);
  const [variety, setVariety] = useState<Variety>('variety');
  const [proposal, setProposal] = useState<WeeklyMealPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const generationLock = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState<{
    key: string;
    date: string;
    mealSlot: MealSlot;
    plan: WeeklyMealPlan;
  } | null>(null);

  const preferences = useMemo(
    () =>
      toEnginePreferences(
        { equipment, allergens, dietary, dislikedRecipes, skippedRecipes, bodyGoal, bodyMetrics },
        weekCuisine
      ),
    [
      equipment,
      allergens,
      dietary,
      dislikedRecipes,
      skippedRecipes,
      bodyGoal,
      bodyMetrics,
      weekCuisine,
    ]
  );
  const pantrySet = useMemo(() => new Set(pantry), [pantry]);
  const currentPlan = step === 'proposal' ? proposal : weeklyPlan;

  const addCheckedNeedsToPantry = () => {
    if (!currentPlan || checkedNeeds.length === 0) return;
    const nextPantry = new Set([...pantry, ...checkedNeeds]);
    let nextPlan: WeeklyMealPlan;
    try {
      nextPlan = recomputePlanGroceryNeeds(currentPlan, BUNDLED_CATALOG, nextPantry);
    } catch {
      setErrorMessage(
        'This plan still needs too many ingredients. Check more items or change a meal.'
      );
      return;
    }
    addPantryItems(checkedNeeds);
    if (nextPlan.status === 'confirmed') setWeeklyPlan(nextPlan);
    else setProposal(nextPlan);
    clearPlanGroceryChecks();
  };

  useEffect(() => {
    let active = true;
    void syncReminders(
      weeklyPlan?.status === 'confirmed' ? weeklyPlan : null,
      remindersEnabled,
      leadMinutes
    ).then((error) => {
      if (active) setReminderError(error);
    });
    return () => {
      active = false;
    };
  }, [weeklyPlan, remindersEnabled, leadMinutes]);

  const toggleMealSlot = (slot: MealSlot) => {
    setMealSlots((current) => {
      const next = current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot];
      return MEAL_SLOTS.filter((s) => next.includes(s));
    });
  };

  const handleBuildPlan = () => {
    if (generationLock.current || mealSlots.length === 0) return;
    generationLock.current = true;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
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

  const confirm = () => {
    if (!proposal) return;
    if (
      proposal.entries.some((entry) => {
        if (entry.kind !== 'recipe') return false;
        const recipe = BUNDLED_CATALOG.find((item) => item.id === entry.recipeId);
        return (
          !recipe ||
          !isHardSafePlanRecipe(recipe, preferences) ||
          preferences.skippedRecipeIds.has(entry.recipeId)
        );
      })
    ) {
      setErrorMessage(
        'Your kitchen preferences changed. Build a new plan to keep every meal suitable.'
      );
      return;
    }
    let currentProposal: WeeklyMealPlan;
    try {
      currentProposal = recomputePlanGroceryNeeds(proposal, BUNDLED_CATALOG, pantrySet);
    } catch {
      setErrorMessage(
        'Your pantry changed and this plan now needs too many ingredients. Adjust a meal or build a new plan.'
      );
      return;
    }
    const confirmed = weeklyMealPlanSchema.parse({ ...currentProposal, status: 'confirmed' });
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

  const replacementInput = useMemo<PlanWeekInput | null>(() => {
    if (!currentPlan || !swapTarget) return null;
    const daysInput: DailyPlanPreference[] = currentPlan.entries.map((entry) => ({
      date: entry.date,
      mealSlot: entry.mealSlot,
      selectedLimit: prepStyle === 'quick' ? 30 : prepStyle === 'batch' ? 120 : 60,
      mealTime:
        entry.kind === 'recipe'
          ? entry.plannedMealTime.slice(11)
          : defaultPlanMealTime(entry.date, entry.mealSlot),
    }));

    return {
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
  }, [
    currentPlan,
    swapTarget,
    prepStyle,
    pantrySet,
    preferences,
    variety,
    planTasteSignals,
    bodyMetrics,
    bodyGoal,
  ]);
  const replacements = useMemo(
    () =>
      currentPlan && swapTarget && replacementInput
        ? getPlanMealReplacements(currentPlan, swapTarget.key, replacementInput)
        : [],
    [currentPlan, swapTarget, replacementInput]
  );
  const swap = (date: string, mealSlot: MealSlot) => {
    if (!currentPlan) return;
    setErrorMessage(null);
    setSwapTarget({ key: `${date}:${mealSlot}`, date, mealSlot, plan: currentPlan });
  };
  const confirmReplacement = (recipeId: string) => {
    if (!currentPlan || !swapTarget || !replacementInput) return;
    if (currentPlan !== swapTarget.plan) {
      setErrorMessage('Your plan changed. Cancel and open Swap again to choose a replacement.');
      return;
    }
    let next: WeeklyMealPlan | null;
    try {
      next = swapPlanMeal(currentPlan, swapTarget.key, replacementInput, recipeId);
    } catch {
      setErrorMessage('Couldn’t replace this meal. Your plan is unchanged; please try again.');
      return;
    }
    if (!next) {
      setErrorMessage('That meal is no longer eligible. Choose another meal or cancel.');
      return;
    }

    if (next.status === 'confirmed') {
      recordConfirmedPlanSelections([recipeId]);
      setWeeklyPlan(next);
    } else {
      setProposal(next);
    }
    setSwapTarget(null);
    setErrorMessage(null);
  };

  const handleBack = () => {
    if (step === 'days') {
      if (weeklyPlan?.status === 'confirmed') setStep('grocery');
      else router.back();
    } else if (step === 'slots') setStep('days');
    else if (step === 'style') setStep('slots');
    else if (step === 'variety') setStep('style');
  };

  if (swapTarget) {
    return (
      <PlanReplacementPicker
        key={swapTarget.key}
        date={swapTarget.date}
        mealSlot={swapTarget.mealSlot}
        replacements={replacements}
        errorMessage={errorMessage}
        onConfirm={confirmReplacement}
        onCancel={() => {
          setSwapTarget(null);
          setErrorMessage(null);
        }}
      />
    );
  }

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
        errorMessage={errorMessage ?? reminderError}
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
      weekCuisine={weekCuisine}
      onWeekCuisine={setWeekCuisine}
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
  weekCuisine,
  onWeekCuisine,
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
  weekCuisine: string | null;
  onWeekCuisine: (value: string | null) => void;
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
      transitionKey={step}
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
      {step === 'style' ? (
        <View style={styles.group}>
          <Text variant="bodyStrong">A food style for this week? (Optional)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <FoodGenreOptions cuisine={weekCuisine} onSelectCuisine={onWeekCuisine} />
          </View>
          <Text variant="caption" tone="muted">
            We may suggest other styles when needed and explain each change. Your allergies, dietary
            needs, and equipment always apply.
          </Text>
        </View>
      ) : null}
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
  const previewNeeds = useMemo(
    () => derivePlanLinkedGroceryPreview(getPlanGroceryEntries(plan, BUNDLED_CATALOG), pantry),
    [plan, pantry]
  );

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
      transitionKey={plan.status}
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
                const missingIds = recipe ? getMissingPlanIngredientIds(recipe, pantry) : [];
                const missingCount = missingIds.length;
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
                        {plan.status === 'draft' && missingIds.length > 0 ? (
                          <Text variant="caption" tone="muted">
                            Missing:{' '}
                            {missingIds
                              .map((id) => lookupIngredient(id)?.displayName ?? id)
                              .join(', ')}
                          </Text>
                        ) : null}
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

      <View style={styles.group}>
        <Text variant="heading">What to get</Text>
        <Text variant="caption" tone="muted">
          {plan.status === 'draft'
            ? 'Preview of ingredients missing from your pantry across this plan. Nothing is saved yet.'
            : 'Only ingredients missing from your pantry, grouped across this plan.'}
        </Text>
        {previewNeeds.length === 0 ? (
          <Card variant="alt">
            <Text variant="body">You have everything this plan needs.</Text>
          </Card>
        ) : (
          previewNeeds.map((need) => {
            const name = lookupIngredient(need.ingredientId)?.displayName ?? need.ingredientId;
            const mealNames = getPlanGroceryNeedMealNames(need, BUNDLED_CATALOG);
            const checked = checkedNeeds.includes(need.ingredientId);
            const content = (
              <>
                <Text variant="bodyStrong">
                  {plan.status === 'confirmed' ? (checked ? '✓ ' : '○ ') : null}
                  {name}
                </Text>
                <Text variant="caption" tone="muted">
                  {mealNames.join(', ')} · {need.dates.join(', ')}
                </Text>
              </>
            );
            return plan.status === 'draft' ? (
              <View key={need.ingredientId} style={styles.needRow}>
                {content}
              </View>
            ) : (
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
                {content}
              </Pressable>
            );
          })
        )}
        {plan.status === 'confirmed' && checkedNeeds.length > 0 ? (
          <PrimaryButton
            label="Add checked items to pantry"
            onPress={onAddChecked}
            accessibilityHint="Confirms purchased ingredients and adds them to your pantry"
          />
        ) : null}
        {plan.status === 'confirmed' ? (
          <PrimaryButton
            label="Open Reminders"
            variant="ghost"
            onPress={() => router.push('/reminders')}
            accessibilityHint="Opens reminders for this confirmed weekly plan"
          />
        ) : null}
        {plan.status === 'confirmed' ? (
          Platform.OS === 'web' ? (
            <Text variant="caption" tone="muted">
              Reminders are unavailable on the web. Your plan is still saved.
            </Text>
          ) : remindersEnabled ? (
            <Text variant="caption" tone="muted">
              Reminders are enabled. Open Reminders to check scheduling status.
            </Text>
          ) : (
            <Text variant="caption" tone="muted">
              Turn on reminders in Settings when you want cooking prompts.
            </Text>
          )
        ) : null}
      </View>
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
    return null;
  } catch (error: unknown) {
    console.warn('[plan] Reminder sync failed; plan state is preserved', error);
    return 'Your plan is saved, but reminders need attention. Open Reminders to retry.';
  }
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
  group: { gap: space.sm },
  dateGroup: { gap: space.xs, marginTop: space.xs },
  desktopDays: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  desktopDay: { width: '48%', flexGrow: 1 },
  mealRow: { gap: space.xs },
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
