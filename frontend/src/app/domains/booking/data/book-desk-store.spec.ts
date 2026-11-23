import { TestBed } from '@angular/core/testing';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { provideTestBackend } from '@app-testing/test-backend';
import { FloorAvailability } from '@app/booking/models/floor-availability';
import { addDays, todayIn, zonedToUtc } from '@app/booking/util/desk-slots';
import { Building, WEEKDAYS } from '@app/spaces/models/building';
import { Floor } from '@app/spaces/models/floor';
import { BookDeskStore } from './book-desk-store';

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
  floorCount: 2,
  createdAt: '2026-11-02T00:00:00Z',
};

const floor = (id: string): Floor => ({
  id,
  buildingId: 'b1',
  name: `Floor ${id}`,
  number: 0,
  sortOrder: 0,
  createdAt: '2026-11-10T00:00:00Z',
});

const availability = (floorId: string): FloorAvailability => ({
  floorId,
  from: '',
  to: '',
  resources: [],
});

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('BookDeskStore', () => {
  let store: BookDeskStore;
  let http: HttpTestingController;

  const availabilityRequest = (floorId: string): TestRequest =>
    http.expectOne((r) => r.url === `/api/v1/floors/${floorId}/availability`);

  async function loadHq(): Promise<void> {
    const done = store.load();
    http.expectOne('/api/v1/buildings').flush([building]);
    await tick();
    http.expectOne('/api/v1/buildings/b1/floors').flush([floor('f1'), floor('f2')]);
    await tick();
    availabilityRequest('f1').flush(availability('f1'));
    await done;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideTestBackend(), BookDeskStore] });
    store = TestBed.inject(BookDeskStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("opens the first building and floor on today's date, midnight to midnight in its time zone", async () => {
    const done = store.load();
    http.expectOne('/api/v1/buildings').flush([building]);
    await tick();
    http.expectOne('/api/v1/buildings/b1/floors').flush([floor('f1'), floor('f2')]);
    await tick();

    const today = todayIn('Europe/Bucharest');
    const req = availabilityRequest('f1');
    expect(req.request.params.get('from')).toBe(
      zonedToUtc(today, '00:00', 'Europe/Bucharest').toISOString(),
    );
    expect(req.request.params.get('to')).toBe(
      zonedToUtc(addDays(today, 1), '00:00', 'Europe/Bucharest').toISOString(),
    );
    req.flush(availability('f1'));
    await done;

    expect(store.building()).toEqual(building);
    expect(store.floorId()).toBe('f1');
    expect(store.date()).toBe(today);
    expect(store.availability()?.floorId).toBe('f1');
    expect(store.loading()).toBe(false);
  });

  it('keeps only the answer to the latest pick when an older one arrives later', async () => {
    await loadHq();

    const first = store.selectFloor('f1');
    const second = store.selectFloor('f2');
    const [older, newer] = [availabilityRequest('f1'), availabilityRequest('f2')];
    newer.flush(availability('f2'));
    await second;
    older.flush(availability('f1'));
    await first;

    expect(store.floorId()).toBe('f2');
    expect(store.availability()?.floorId).toBe('f2');
  });

  it('loads the same floor and day again on refresh', async () => {
    await loadHq();
    const dated = store.selectDate('2026-12-07');
    availabilityRequest('f1').flush(availability('f1'));
    await dated;

    const done = store.refresh();
    const req = availabilityRequest('f1');
    expect(req.request.params.get('from')).toBe('2026-12-06T22:00:00.000Z');
    expect(req.request.params.get('to')).toBe('2026-12-07T22:00:00.000Z');
    req.flush(availability('f1'));
    await done;

    expect(store.date()).toBe('2026-12-07');
  });

  it('shows a message when loading fails', async () => {
    const done = store.load();
    http.expectOne('/api/v1/buildings').flush(null, { status: 500, statusText: 'Error' });
    await done;

    expect(store.error()).toContain('could not be loaded');
    expect(store.loading()).toBe(false);
  });
});
