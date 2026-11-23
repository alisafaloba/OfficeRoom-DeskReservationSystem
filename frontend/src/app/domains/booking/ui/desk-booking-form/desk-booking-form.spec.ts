import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DeskBooking,
  DeskBookingInput,
  DeskBookingSettings,
} from '@app/booking/models/desk-booking';
import { Building, WEEKDAYS } from '@app/spaces/models/building';
import { addDays, todayIn, weekdayOf } from '@app/booking/util/desk-slots';
import { NOW } from '@app/booking/util/now';
import { DeskBookingForm } from './desk-booking-form';

/** A Monday one to two weeks ahead, inside the 90-day horizon whatever today is. */
function upcomingMonday(): string {
  let date = addDays(todayIn('Europe/Bucharest'), 7);
  while (weekdayOf(date) !== 'MONDAY') date = addDays(date, 1);
  return date;
}

const MONDAY = upcomingMonday();
const SATURDAY = addDays(MONDAY, 5);

const settings: DeskBookingSettings = {
  halfDaySplit: '13:00:00',
  maxDaysAhead: 90,
  stepMinutes: 15,
};

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

describe('DeskBookingForm', () => {
  let fixture: ComponentFixture<DeskBookingForm>;
  let submitted: DeskBookingInput[];

  const el = () => fixture.nativeElement as HTMLElement;
  const query = <T extends HTMLElement>(selector: string) => el().querySelector<T>(selector)!;
  const bookButton = () => query<HTMLButtonElement>('button[type="submit"]');
  const change = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const pick = (mode: string) => {
    query<HTMLInputElement>(`#desk-booking-mode-${mode}`).dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const submit = () => {
    query('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  beforeAll(() => {
    // jsdom has no modal <dialog>; the browser provides it in production.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
  });

  /** `now` fixes the clock, e.g. to book today; by default the real time. */
  function create(date: string | null = MONDAY, now?: Date): void {
    if (now) TestBed.configureTestingModule({ providers: [{ provide: NOW, useValue: () => now }] });
    fixture = TestBed.createComponent(DeskBookingForm);
    fixture.componentRef.setInput('settings', settings);
    fixture.componentRef.setInput('resourceId', 'r1');
    fixture.componentRef.setInput('resourceName', 'Desk 3.14');
    fixture.componentRef.setInput('building', building);
    fixture.componentRef.setInput('initialDate', date);
    submitted = [];
    fixture.componentInstance.submitted.subscribe((v) => submitted.push(v));
    fixture.detectChanges();
  }

  it("shows the opening hours and the presets' times in the building's time zone", () => {
    create();

    expect(el().textContent).toContain('Book Desk 3.14');
    expect(el().textContent).toContain('All times are in Europe/Bucharest');
    expect(el().textContent).toContain('Open 08:00–18:00');
    expect(el().textContent).toContain('08:00–13:00');
    expect(el().textContent).toContain('13:00–18:00');
  });

  it('books a full day by default', () => {
    create();
    submit();

    expect(submitted).toEqual([{ resourceId: 'r1', date: MONDAY, mode: 'FULL_DAY' }]);
  });

  it('books a half day without times', () => {
    create();
    pick('AFTERNOON');
    submit();

    expect(submitted).toEqual([{ resourceId: 'r1', date: MONDAY, mode: 'AFTERNOON' }]);
  });

  it('offers custom times in 15-minute steps inside the opening hours', () => {
    create();
    pick('CUSTOM');

    const start = query<HTMLSelectElement>('#desk-booking-start');
    const options = Array.from(start.options).map((o) => o.value);
    expect(options[0]).toBe('08:00');
    expect(options[1]).toBe('08:15');
    expect(options.at(-1)).toBe('17:45');

    change(start, '09:15');
    const end = query<HTMLSelectElement>('#desk-booking-end');
    expect(end.options[0].value).toBe('09:30');
    change(end, '11:00');
    submit();

    expect(submitted).toEqual([
      { resourceId: 'r1', date: MONDAY, mode: 'CUSTOM', startTime: '09:15', endTime: '11:00' },
    ]);
  });

  it('keeps the custom times when another day has the same opening hours', () => {
    create();
    pick('CUSTOM');
    change(query<HTMLSelectElement>('#desk-booking-start'), '09:15');
    change(query<HTMLSelectElement>('#desk-booking-end'), '11:00');

    change(query<HTMLInputElement>('#desk-booking-date'), addDays(MONDAY, 1));
    submit();

    expect(submitted).toEqual([
      {
        resourceId: 'r1',
        date: addDays(MONDAY, 1),
        mode: 'CUSTOM',
        startTime: '09:15',
        endTime: '11:00',
      },
    ]);
  });

  it('falls back to the full day when the picked half day does not exist on the new date', () => {
    // Fridays open at 14:00, after the 13:00 split: no morning and no afternoon.
    const lateFriday: Building = {
      ...building,
      openingHours: building.openingHours.map((h) =>
        h.dayOfWeek === 'FRIDAY' ? { ...h, opensAt: '14:00:00', closesAt: '18:00:00' } : h,
      ),
    };
    create();
    fixture.componentRef.setInput('building', lateFriday);
    fixture.detectChanges();
    pick('AFTERNOON');

    change(query<HTMLInputElement>('#desk-booking-date'), addDays(MONDAY, 4));

    expect(query<HTMLInputElement>('#desk-booking-mode-AFTERNOON').disabled).toBe(true);
    expect(query<HTMLInputElement>('#desk-booking-mode-FULL_DAY').checked).toBe(true);
    submit();
    expect(submitted).toEqual([{ resourceId: 'r1', date: addDays(MONDAY, 4), mode: 'FULL_DAY' }]);
  });

  it("previews today's presets from the next quarter hour and offers only later custom times", () => {
    create(MONDAY, new Date(`${MONDAY}T08:07:00Z`)); // 10:07 in Bucharest

    expect(el().textContent).toContain('10:15–18:00');
    expect(query<HTMLInputElement>('#desk-booking-mode-MORNING').disabled).toBe(false);
    expect(el().textContent).toContain('10:15–13:00');

    pick('CUSTOM');
    const start = query<HTMLSelectElement>('#desk-booking-start');
    expect(start.options[0].value).toBe('10:15');
  });

  it('disables a half day of today that is over', () => {
    create(MONDAY, new Date(`${MONDAY}T11:30:00Z`)); // 13:30 in Bucharest

    expect(query<HTMLInputElement>('#desk-booking-mode-MORNING').disabled).toBe(true);
    expect(el().textContent).toContain('13:30–18:00');
  });

  it('says so when nothing is left to book today', () => {
    create(MONDAY, new Date(`${MONDAY}T16:00:00Z`)); // 18:00 in Bucharest

    expect(el().textContent).toContain('There is no time left to book today.');
    expect(el().querySelector('fieldset')).toBeNull();
    expect(bookButton().disabled).toBe(true);
  });

  it('cannot book a day the building is closed', () => {
    create();
    change(query<HTMLInputElement>('#desk-booking-date'), SATURDAY);

    expect(el().textContent).toContain('The building is closed on this day.');
    expect(bookButton().disabled).toBe(true);
    submit();
    expect(submitted).toEqual([]);
  });

  it('cannot book a past date', () => {
    create('2000-01-03');

    expect(el().textContent).toContain('Pick today or a later date.');
    expect(bookButton().disabled).toBe(true);
  });

  it('cannot book more than 90 days ahead', () => {
    create(null);
    const date = query<HTMLInputElement>('#desk-booking-date');
    expect(date.max).toBe(addDays(date.min, 90));

    change(date, addDays(date.min, 91));

    expect(el().textContent).toContain('at most 90 days ahead');
    expect(bookButton().disabled).toBe(true);
  });

  it('shows the error from the server', () => {
    create();
    fixture.componentRef.setInput(
      'error',
      'Someone else has already booked this desk for this time.',
    );
    fixture.detectChanges();

    expect(query('[role="alert"]').textContent).toContain('Someone else has already booked');
  });

  it('shows the confirmation instead of the form', () => {
    create();
    const done: DeskBooking = {
      booking: {} as DeskBooking['booking'],
      timeZone: 'Europe/Bucharest',
      date: MONDAY,
      startTime: '08:00:00',
      endTime: '13:00:00',
    };
    fixture.componentRef.setInput('confirmation', done);
    fixture.detectChanges();

    expect(el().querySelector('form')).toBeNull();
    expect(el().textContent).toContain('Your booking is confirmed.');
    expect(query('[role="status"]').textContent).toContain(`Desk 3.14 on ${MONDAY}, 08:00–13:00`);
  });
});
