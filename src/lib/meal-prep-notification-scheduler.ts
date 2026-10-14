import {
  getMealPrepReminder,
  type MealPrepReminderEntry,
  type MealPrepReminderLeadMinutes,
} from '@/lib/meal-prep-reminder';

export interface MealPrepReminderSettings {
  readonly enabled: boolean;
  readonly leadMinutes: MealPrepReminderLeadMinutes;
}

export interface LocalNotificationClient {
  hasPermission: () => Promise<boolean>;
  ensureChannel: () => Promise<void>;
  getIdentifiers: () => string[];
  setIdentifiers: (identifiers: string[]) => void;
  cancel: (identifier: string) => Promise<void>;
  schedule: (notification: {
    readonly title: string;
    readonly body: string;
    readonly triggerAt: Date;
  }) => Promise<string>;
}

export interface MealPrepReminderScheduler {
  clear: () => Promise<void>;
  sync: (
    entries: readonly MealPrepReminderEntry[],
    settings: MealPrepReminderSettings
  ) => Promise<void>;
}

const NOTIFICATION_TITLE = 'Time to start cooking';

export function createMealPrepReminderScheduler(
  client: LocalNotificationClient,
  now: () => Date
): MealPrepReminderScheduler {
  let pending: Promise<void> = Promise.resolve();

  async function clearInternal(): Promise<void> {
    const identifiers = client.getIdentifiers();
    await Promise.all(identifiers.map((identifier) => client.cancel(identifier)));
    client.setIdentifiers([]);
  }

  async function syncInternal(
    entries: readonly MealPrepReminderEntry[],
    settings: MealPrepReminderSettings
  ): Promise<void> {
    if (!settings.enabled) {
      await clearInternal();
      return;
    }
    if (!(await client.hasPermission())) {
      await clearInternal();
      return;
    }

    await client.ensureChannel();
    await clearInternal();

    const identifiers: string[] = [];
    let failures = 0;
    for (const entry of entries) {
      const reminder = getMealPrepReminder(entry, settings.leadMinutes, now());
      if (!reminder) continue;

      try {
        identifiers.push(
          await client.schedule({
            title: NOTIFICATION_TITLE,
            body: `Start ${reminder.recipeTitle} now to eat on time.`,
            triggerAt: reminder.notificationTime,
          })
        );
        client.setIdentifiers([...identifiers]);
      } catch (error: unknown) {
        failures += 1;
        console.warn(`[notifications] Unable to schedule meal-prep entry ${entry.id}`, error);
      }
    }

    client.setIdentifiers(identifiers);
    if (failures > 0)
      throw new Error(
        `${failures} cooking reminder${failures === 1 ? '' : 's'} could not be scheduled. Try again.`
      );
  }

  function clear(): Promise<void> {
    const operation = pending.then(() => clearInternal());
    pending = operation.catch(() => undefined);
    return operation;
  }

  function sync(
    entries: readonly MealPrepReminderEntry[],
    settings: MealPrepReminderSettings
  ): Promise<void> {
    const operation = pending.then(() => syncInternal(entries, settings));
    pending = operation.catch(() => undefined);
    return operation;
  }

  return { clear, sync };
}
