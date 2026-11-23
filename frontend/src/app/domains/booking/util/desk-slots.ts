import { Building, Weekday, WEEKDAYS } from '@app/spaces/models/building';
import { DeskBookingMode, HALF_DAY_SPLIT, STEP_MINUTES } from '@app/booking/models/desk-booking';

/** A start and end time of one day, `HH:mm`, in the building's time zone. */
export interface LocalSlot {
  readonly start: string;
  readonly end: string;
}

/** Today's date (`YYYY-MM-DD`) in the given IANA zone, whatever the browser's zone is. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // Built from the parts, not from a locale's date pattern, which can change between ICU versions.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The `YYYY-MM-DD` date `days` days after `date`. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The weekday of a `YYYY-MM-DD` date; the date has no zone, so UTC reads it as written. */
export function weekdayOf(date: string): Weekday {
  const sundayFirst = new Date(`${date}T00:00:00Z`).getUTCDay();
  return WEEKDAYS[(sundayFirst + 6) % 7];
}

/** `HH:mm:ss` or `HH:mm` → `HH:mm`. */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** The building's opening hours on that date, or `null` when it is closed. */
export function hoursOn(building: Building, date: string): LocalSlot | null {
  const day = weekdayOf(date);
  const hours = building.openingHours.find((h) => h.dayOfWeek === day);
  if (!hours?.opensAt || !hours.closesAt) return null;
  return { start: hhmm(hours.opensAt), end: hhmm(hours.closesAt) };
}

/**
 * The slot a preset mode books within the opening hours; `null` when that half day does not
 * exist (the split is not strictly inside the hours). CUSTOM has no preset slot.
 */
export function presetSlot(mode: DeskBookingMode, hours: LocalSlot): LocalSlot | null {
  const splitInside = hours.start < HALF_DAY_SPLIT && HALF_DAY_SPLIT < hours.end;
  switch (mode) {
    case 'FULL_DAY':
      return hours;
    case 'MORNING':
      return splitInside ? { start: hours.start, end: HALF_DAY_SPLIT } : null;
    case 'AFTERNOON':
      return splitInside ? { start: HALF_DAY_SPLIT, end: hours.end } : null;
    case 'CUSTOM':
      return null;
  }
}

/** Every 15-minute mark from `from` to `to`, both included, as `HH:mm`. */
export function timeSteps(from: string, to: string): string[] {
  const steps: string[] = [];
  const first = Math.ceil(minutes(from) / STEP_MINUTES) * STEP_MINUTES;
  for (let m = first; m <= minutes(to); m += STEP_MINUTES) {
    steps.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return steps;
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
