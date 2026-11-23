import { Building, WEEKDAYS } from '@app/spaces/models/building';
import {
  addDays,
  hhmm,
  hoursOn,
  notBefore,
  presetSlot,
  timeSteps,
  todayIn,
  weekdayOf,
  zonedNow,
} from './desk-slots';

const building: Building = {
  id: 'b1',
  name: 'HQ',
  address: '1 Main Street',
  timeZone: 'Europe/Bucharest',
  openingHours: WEEKDAYS.map((dayOfWeek) =>
    dayOfWeek === 'SATURDAY' || dayOfWeek === 'SUNDAY'
      ? { dayOfWeek, opensAt: null, closesAt: null }
      : { dayOfWeek, opensAt: '08:00:00', closesAt: '18:00:00' },
  ),
  floorCount: 1,
  createdAt: '2026-11-02T00:00:00Z',
};

describe('desk slots', () => {
  it("takes today's date in the building's zone, not the browser's", () => {
    const lateEveningUtc = new Date('2026-12-01T23:30:00Z');

    expect(todayIn('Europe/Bucharest', lateEveningUtc)).toBe('2026-12-02');
    expect(todayIn('America/New_York', lateEveningUtc)).toBe('2026-12-01');
  });

  it('always formats today as YYYY-MM-DD', () => {
    expect(todayIn('Pacific/Kiritimati', new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-06');
  });

  it("rounds now up to the next step mark in the building's zone, like the server", () => {
    expect(zonedNow('Europe/Bucharest', 15, new Date('2026-12-07T08:07:00Z'))).toEqual({
      date: '2026-12-07',
      earliestStart: '10:15',
    });
    expect(zonedNow('Europe/Bucharest', 15, new Date('2026-12-07T08:15:00Z')).earliestStart).toBe(
      '10:15',
    );
    expect(zonedNow('Europe/Bucharest', 15, new Date('2026-12-07T08:15:01Z')).earliestStart).toBe(
      '10:30',
    );
    expect(zonedNow('Europe/Bucharest', 15, new Date('2026-12-07T21:50:00Z')).earliestStart).toBe(
      '24:00',
    );
  });

  it("starts today's slots no earlier than now, or drops them when they are over", () => {
    const day = { start: '08:00', end: '18:00' };

    expect(notBefore(day, '07:00')).toEqual(day);
    expect(notBefore(day, '10:15')).toEqual({ start: '10:15', end: '18:00' });
    expect(notBefore(day, '18:00')).toBeNull();
  });

  it('uses the configured split', () => {
    expect(presetSlot('MORNING', { start: '08:00', end: '18:00' }, '12:30:00')).toEqual({
      start: '08:00',
      end: '12:30',
    });
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-11-23', 90)).toBe('2027-02-21');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('reads the weekday of a plain date', () => {
    expect(weekdayOf('2026-12-07')).toBe('MONDAY');
    expect(weekdayOf('2026-12-13')).toBe('SUNDAY');
  });

  it('cuts the seconds off API times', () => {
    expect(hhmm('08:00:00')).toBe('08:00');
    expect(hhmm('13:15')).toBe('13:15');
  });

  it('finds the opening hours of the date, or null on a closed day', () => {
    expect(hoursOn(building, '2026-12-07')).toEqual({ start: '08:00', end: '18:00' });
    expect(hoursOn(building, '2026-12-12')).toBeNull();
  });

  it('derives full and half days from the opening hours', () => {
    const hours = { start: '08:00', end: '18:00' };

    expect(presetSlot('FULL_DAY', hours, '13:00:00')).toEqual(hours);
    expect(presetSlot('MORNING', hours, '13:00:00')).toEqual({ start: '08:00', end: '13:00' });
    expect(presetSlot('AFTERNOON', hours, '13:00:00')).toEqual({ start: '13:00', end: '18:00' });
    expect(presetSlot('CUSTOM', hours, '13:00:00')).toBeNull();
  });

  it('has no half day when the split is not inside the opening hours', () => {
    expect(presetSlot('MORNING', { start: '13:00', end: '20:00' }, '13:00:00')).toBeNull();
    expect(presetSlot('AFTERNOON', { start: '08:00', end: '13:00' }, '13:00:00')).toBeNull();
  });

  it('lists 15-minute steps, both ends included', () => {
    expect(timeSteps('08:00', '09:00', 15)).toEqual(['08:00', '08:15', '08:30', '08:45', '09:00']);
    expect(timeSteps('08:10', '08:40', 15)).toEqual(['08:15', '08:30']);
  });
});
