import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideTestBackend } from '@app-testing/test-backend';
import { FloorAvailability } from '@app/booking/models/floor-availability';
import { addDays, todayIn, weekdayOf } from '@app/booking/util/desk-slots';
import { Building, WEEKDAYS } from '@app/spaces/models/building';
import { BookDesk } from './book-desk';

const building: Building = {
  id: 'b1',
  name: 'HQ',
  address: '1 Main Street',
  timeZone: 'Europe/Bucharest',
  openingHours: WEEKDAYS.map((dayOfWeek) => ({
    dayOfWeek,
    opensAt: '08:00:00',
    closesAt: '18:00:00',
  })),
  floorCount: 1,
  createdAt: '2026-11-02T00:00:00Z',
};

const floorAvailability: FloorAvailability = {
  floorId: 'f1',
  from: '',
  to: '',
  resources: [
    {
      resourceId: 'r1',
      name: 'Desk 1',
      type: 'DESK',
      bookable: true,
      status: 'FREE',
      bookings: [],
    },
    {
      resourceId: 'r2',
      name: 'Desk 2',
      type: 'DESK',
      bookable: true,
      status: 'BOOKED',
      bookings: [
        {
          startsAt: '2026-12-07T06:00:00Z',
          endsAt: '2026-12-07T11:00:00Z',
          title: null,
          bookedBy: 'Ana Pop',
          mine: false,
        },
      ],
    },
    {
      resourceId: 'r3',
      name: 'Desk 3',
      type: 'DESK',
      bookable: true,
      status: 'UNAVAILABLE',
      bookings: [],
    },
    {
      resourceId: 'r5',
      name: 'Boardroom',
      type: 'MEETING_ROOM',
      bookable: true,
      status: 'FREE',
      bookings: [],
    },
    {
      resourceId: 'r4',
      name: 'Kitchen',
      type: 'BREAK_ROOM',
      bookable: false,
      status: 'FREE',
      bookings: [],
    },
  ],
};

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('BookDesk', () => {
  let fixture: ComponentFixture<BookDesk>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const row = (name: string) => el().querySelector<HTMLElement>(`[data-resource="${name}"]`)!;
  const bookButton = (name: string) => row(name).querySelector<HTMLButtonElement>('button');
  const flushAvailability = () =>
    http
      .match((r) => r.url === '/api/v1/floors/f1/availability')
      .forEach((r) => r.flush(floorAvailability));

  /** A Monday one to two weeks ahead, so the test never depends on the time of day. */
  async function pickUpcomingMonday(): Promise<string> {
    let date = addDays(todayIn('Europe/Bucharest'), 7);
    while (weekdayOf(date) !== 'MONDAY') date = addDays(date, 1);
    const dateInput = el().querySelector<HTMLInputElement>('#book-desk-date')!;
    dateInput.value = date;
    dateInput.dispatchEvent(new Event('change'));
    flushAvailability();
    await fixture.whenStable();
    fixture.detectChanges();
    return date;
  }

  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
  });

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: provideTestBackend() });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BookDesk);
    fixture.detectChanges();

    http
      .expectOne('/api/v1/bookings/desk/settings')
      .flush({ halfDaySplit: '13:00:00', maxDaysAhead: 90, stepMinutes: 15 });
    http.expectOne('/api/v1/buildings').flush([building]);
    await tick();
    http
      .expectOne('/api/v1/buildings/b1/floors')
      .flush([
        { id: 'f1', buildingId: 'b1', name: 'Ground', number: 0, sortOrder: 0, createdAt: '' },
      ]);
    await tick();
    flushAvailability();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it("lists every place with its status and the day's bookings on the building's clock", () => {
    expect(row('Desk 1').textContent).toContain('Free');
    expect(row('Desk 2').textContent).toContain('Partly or fully booked');
    expect(row('Desk 2').textContent).toContain('08:00–13:00');
    expect(row('Desk 2').textContent).toContain('Ana Pop');
    expect(row('Desk 3').textContent).toContain('Unavailable');
    expect(row('Boardroom').textContent).toContain('Meeting room');
    expect(el().textContent).toContain('Times in Europe/Bucharest');
  });

  it('offers Book for bookable places that are not out of service', () => {
    expect(bookButton('Desk 1')!.disabled).toBe(false);
    expect(bookButton('Desk 2')!.disabled).toBe(false);
    expect(bookButton('Desk 3')!.disabled).toBe(true);
    expect(bookButton('Kitchen')).toBeNull();
  });

  it('offers no Book for meeting rooms: they are not booked as a desk', () => {
    expect(bookButton('Boardroom')).toBeNull();
  });

  it('books a place in the dialog, shows the confirmation and reloads the list', async () => {
    const date = await pickUpcomingMonday();

    bookButton('Desk 1')!.click();
    fixture.detectChanges();
    expect(el().querySelector('dialog')?.textContent).toContain('Book Desk 1');

    el().querySelector('dialog form')!.dispatchEvent(new Event('submit'));
    const post = http.expectOne('/api/v1/bookings/desk');
    expect(post.request.body).toEqual({ resourceId: 'r1', date, mode: 'FULL_DAY' });
    post.flush({
      booking: { id: 'bk1' },
      timeZone: 'Europe/Bucharest',
      date,
      startTime: '08:00:00',
      endTime: '18:00:00',
    });
    await tick();
    flushAvailability();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('[role="status"]')?.textContent).toContain('Desk 1 on');
    expect(el().querySelector('[role="status"]')?.textContent).toContain('08:00–18:00');
  });

  it('shows the reason when the server refuses the booking', async () => {
    await pickUpcomingMonday();
    bookButton('Desk 2')!.click();
    fixture.detectChanges();

    el().querySelector('dialog form')!.dispatchEvent(new Event('submit'));
    http
      .expectOne('/api/v1/bookings/desk')
      .flush({ code: 'BOOKING_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('dialog [role="alert"]')?.textContent).toContain('already booked');
  });
});
