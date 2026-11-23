import { Building, Weekday, WEEKDAYS } from '@app/spaces/models/building';
import { DeskBookingMode } from '@app/booking/models/desk-booking';

/** A start and end time of one day, `HH:mm`, in the building's time zone. */
export interface LocalSlot {
  readonly start: string;
  readonly end: string;
}

/** A moment as the building's wall clock shows it. */
export interface ZonedMoment {
  /** `YYYY-MM-DD` */
  readonly date: string;
  /** `HH:mm`, rounded up to the next step mark (seconds count), so it can pass `24:00`. */
  readonly earliestStart: string;
}

/**
 * Today's date in the building's zone and the earliest start the server would book today, the
 * way it rounds: up to the next step mark, whatever the browser's zone is.
 */
export function zonedNow(
  timeZone: string,
  stepMinutes: number,
  now: Date = new Date(),
): ZonedMoment {
  // Built from the parts, not from a locale's date pattern, which can change between ICU versions.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const exact = Number(part('second')) > 0 || now.getMilliseconds() > 0;
  const elapsed = Number(part('hour')) * 60 + Number(part('minute')) + (exact ? 1 : 0);
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    earliestStart: clock(Math.ceil(elapsed / stepMinutes) * stepMinutes),
  };
}

/** Today's date (`YYYY-MM-DD`) in the given IANA zone, whatever the browser's zone is. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return zonedNow(timeZone, 1, now).date;
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
export function presetSlot(
  mode: DeskBookingMode,
  hours: LocalSlot,
  halfDaySplit: string,
): LocalSlot | null {
  const split = hhmm(halfDaySplit);
  const splitInside = hours.start < split && split < hours.end;
  switch (mode) {
    case 'FULL_DAY':
      return hours;
    case 'MORNING':
      return splitInside ? { start: hours.start, end: split } : null;
    case 'AFTERNOON':
      return splitInside ? { start: split, end: hours.end } : null;
    case 'CUSTOM':
      return null;
  }
}

/**
 * What the server books for a slot of today: it starts no earlier than `earliestStart`;
 * `null` when nothing of it is left.
 */
export function notBefore(slot: LocalSlot, earliestStart: string): LocalSlot | null {
  const start = slot.start > earliestStart ? slot.start : earliestStart;
  return start < slot.end ? { start, end: slot.end } : null;
}

/** Every step mark from `from` to `to`, both included, as `HH:mm`. */
export function timeSteps(from: string, to: string, stepMinutes: number): string[] {
  const steps: string[] = [];
  const first = Math.ceil(minutes(from) / stepMinutes) * stepMinutes;
  for (let m = first; m <= minutes(to); m += stepMinutes) {
    steps.push(clock(m));
  }
  return steps;
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function clock(totalMinutes: number): string {
  return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
