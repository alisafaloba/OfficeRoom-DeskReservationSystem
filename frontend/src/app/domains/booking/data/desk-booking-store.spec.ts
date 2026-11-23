import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideTestBackend } from '@app-testing/test-backend';
import { DeskBooking, DeskBookingInput } from '@app/booking/models/desk-booking';
import { DeskBookingStore } from './desk-booking-store';

const URL = '/api/v1/bookings/desk';

const input: DeskBookingInput = { resourceId: 'r1', date: '2026-12-07', mode: 'MORNING' };

const stored: DeskBooking = {
  booking: {
    id: 'bk1',
    resourceId: 'r1',
    userId: 'u1',
    type: 'DESK',
    title: null,
    description: null,
    startsAt: '2026-12-07T06:00:00Z',
    endsAt: '2026-12-07T11:00:00Z',
    status: 'CONFIRMED',
    cancelReason: null,
    attendeeIds: [],
    createdAt: '2026-11-23T00:00:00Z',
    updatedAt: '2026-11-23T00:00:00Z',
  },
  timeZone: 'Europe/Bucharest',
  date: '2026-12-07',
  startTime: '08:00:00',
  endTime: '13:00:00',
};

describe('DeskBookingStore', () => {
  let store: DeskBookingStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideTestBackend(), DeskBookingStore] });
    store = TestBed.inject(DeskBookingStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the input and keeps the confirmation', async () => {
    const result = store.book(input);
    expect(store.saving()).toBe(true);

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush(stored, { status: 201, statusText: 'Created' });

    expect(await result).toEqual(stored);
    expect(store.confirmation()).toEqual(stored);
    expect(store.saving()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it.each([
    ['BOOKING_CONFLICT', 409, 'already booked for that time'],
    ['USER_ALREADY_HAS_DESK', 409, 'You already have a place of this kind'],
    ['RESOURCE_UNAVAILABLE', 409, 'not available'],
    ['OUTSIDE_OPENING_HOURS', 400, 'closed'],
    ['BOOKING_IN_PAST', 400, 'already passed'],
    ['BOOKING_TOO_FAR_AHEAD', 400, 'too far ahead'],
  ])('explains %s', async (code, status, text) => {
    const result = store.book(input);
    http.expectOne(URL).flush({ code }, { status, statusText: 'Error' });

    expect(await result).toBeNull();
    expect(store.error()).toContain(text);
    expect(store.confirmation()).toBeNull();
  });

  it('loads the settings once', async () => {
    const settings = { halfDaySplit: '13:00:00', maxDaysAhead: 90, stepMinutes: 15 };
    const first = store.loadSettings();
    http.expectOne('/api/v1/bookings/desk/settings').flush(settings);
    await first;

    await store.loadSettings();

    expect(store.settings()).toEqual(settings);
    http.expectNone('/api/v1/bookings/desk/settings');
  });

  it('forgets the last result on reset', async () => {
    const result = store.book(input);
    http
      .expectOne(URL)
      .flush({ code: 'BOOKING_CONFLICT' }, { status: 409, statusText: 'Conflict' });
    await result;

    store.reset();

    expect(store.error()).toBeNull();
    expect(store.confirmation()).toBeNull();
  });
});
