import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DeskBooking, DeskBookingInput } from '@app/booking/models/desk-booking';
import { Building, WEEKDAYS } from '@app/spaces/models/building';
import { addDays, todayIn, weekdayOf } from '@app/booking/util/desk-slots';
import { DeskBookingForm } from './desk-booking-form';

/** A Monday one to two weeks ahead, inside the 90-day horizon whatever today is. */
function upcomingMonday(): string {
  let date = addDays(todayIn('Europe/Bucharest'), 7);
  while (weekdayOf(date) !== 'MONDAY') date = addDays(date, 1);
  return date;
}

const MONDAY = upcomingMonday();
const SATURDAY = addDays(MONDAY, 5);

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

  function create(date: string | null = MONDAY): void {
    fixture = TestBed.createComponent(DeskBookingForm);
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
    expect(query('[role="status"]').textContent).toContain(`Desk 3.14 on ${MONDAY}, 08:00–13:00`);
  });
});
