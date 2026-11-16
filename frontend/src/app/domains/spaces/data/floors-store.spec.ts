import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideTestBackend } from '@app-testing/test-backend';
import { Building, WEEKDAYS } from '@app/spaces/models/building';
import { Floor } from '@app/spaces/models/floor';
import { FloorsStore } from './floors-store';

const BUILDING_ID = 'b1';
const FLOORS_URL = `/api/v1/buildings/${BUILDING_ID}/floors`;

const building: Building = {
  id: BUILDING_ID,
  name: 'HQ',
  address: '1 Main Street',
  timeZone: 'Europe/Bucharest',
  openingHours: WEEKDAYS.map((dayOfWeek) => ({ dayOfWeek, opensAt: null, closesAt: null })),
  floorCount: 3,
  createdAt: '2026-11-02T00:00:00Z',
};

const floor = (n: number, sortOrder = n): Floor => ({
  id: `f${n}`,
  buildingId: BUILDING_ID,
  name: `Floor ${n}`,
  number: n,
  sortOrder,
  createdAt: '2026-11-10T00:00:00Z',
});

const tick = () => new Promise((resolve) => setTimeout(resolve));
const isList = (r: { url: string; method: string }) => r.url === FLOORS_URL && r.method === 'GET';

describe('FloorsStore', () => {
  let store: FloorsStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideTestBackend(), FloorsStore] });
    store = TestBed.inject(FloorsStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function loaded(floors: Floor[]): Promise<void> {
    const loading = store.load(BUILDING_ID);
    expect(store.loading()).toBe(true);
    http.expectOne(`/api/v1/buildings/${BUILDING_ID}`).flush(building);
    http.expectOne(isList).flush(floors);
    await loading;
  }

  it('loads the building and its floors in the order the server sends', async () => {
    await loaded([floor(2, 0), floor(0, 1), floor(1, 2)]);

    expect(store.building()?.name).toBe('HQ');
    expect(store.items().map((f) => f.name)).toEqual(['Floor 2', 'Floor 0', 'Floor 1']);
    expect(store.loading()).toBe(false);
  });

  it('exposes a load error for an unknown building', async () => {
    const loading = store.load(BUILDING_ID);
    http
      .expectOne(`/api/v1/buildings/${BUILDING_ID}`)
      .flush({ code: 'BUILDING_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    // forkJoin cancels the sibling request once one fails.
    expect(http.match(isList).every((r) => r.cancelled)).toBe(true);
    await loading;

    expect(store.loadError()).toBe('This building no longer exists.');
  });

  it('creates a floor and reloads the list', async () => {
    await loaded([]);
    const saving = store.create({ name: 'Ground', number: 0 });
    const req = http.expectOne((r) => r.url === FLOORS_URL && r.method === 'POST');
    expect(req.request.body).toEqual({ name: 'Ground', number: 0 });
    req.flush(floor(0));
    await tick();
    http.expectOne(isList).flush([floor(0)]);

    expect(await saving).toBe(true);
    expect(store.items()).toHaveLength(1);
  });

  it('updates and deletes a floor by id', async () => {
    await loaded([floor(0)]);

    const updating = store.update('f0', { name: 'Lobby', number: 0 });
    http.expectOne((r) => r.url === `${FLOORS_URL}/f0` && r.method === 'PUT').flush(floor(0));
    await tick();
    http.expectOne(isList).flush([{ ...floor(0), name: 'Lobby' }]);
    expect(await updating).toBe(true);

    const removing = store.remove('f0');
    http.expectOne((r) => r.url === `${FLOORS_URL}/f0` && r.method === 'DELETE').flush(null);
    await tick();
    http.expectOne(isList).flush([]);
    expect(await removing).toBe(true);
    expect(store.items()).toEqual([]);
  });

  it('maps a duplicate floor number to a message and keeps the dialog open', async () => {
    await loaded([floor(1)]);
    const saving = store.create({ name: 'Also first', number: 1 });
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ code: 'FLOOR_NUMBER_ALREADY_IN_USE' }, { status: 409, statusText: 'Conflict' });

    expect(await saving).toBe(false);
    expect(store.saveError()).toBe('This building already has a floor with this number.');
    store.clearSaveError();
    expect(store.saveError()).toBeNull();
  });

  it('shows a move at once and sends every floor id in the new order', async () => {
    await loaded([floor(0), floor(1), floor(2)]);

    const moving = store.move(2, 0);
    expect(store.items().map((f) => f.id)).toEqual(['f2', 'f0', 'f1']);
    const req = http.expectOne((r) => r.url === `${FLOORS_URL}/order` && r.method === 'PUT');
    expect(req.request.body).toEqual({ floorIds: ['f2', 'f0', 'f1'] });
    req.flush([floor(2, 0), floor(0, 1), floor(1, 2)]);

    expect(await moving).toBe(true);
    expect(store.items().map((f) => f.sortOrder)).toEqual([0, 1, 2]);
  });

  it('ignores a move to the same place or out of range', async () => {
    await loaded([floor(0), floor(1)]);

    expect(await store.move(1, 1)).toBe(false);
    expect(await store.move(0, -1)).toBe(false);
    expect(await store.move(1, 2)).toBe(false);
    http.expectNone((r) => r.method === 'PUT');
  });

  it('puts the floors back when a reorder fails', async () => {
    await loaded([floor(0), floor(1)]);

    const moving = store.move(0, 1);
    http
      .expectOne((r) => r.url === `${FLOORS_URL}/order`)
      .flush({}, { status: 500, statusText: 'Error' });

    expect(await moving).toBe(false);
    expect(store.items().map((f) => f.id)).toEqual(['f0', 'f1']);
    expect(store.reorderError()).toBe('Something went wrong. Please try again.');
  });

  it('reloads the list when the order is outdated', async () => {
    await loaded([floor(0), floor(1)]);

    const moving = store.move(0, 1);
    http
      .expectOne((r) => r.url === `${FLOORS_URL}/order`)
      .flush({ code: 'FLOOR_ORDER_OUTDATED' }, { status: 409, statusText: 'Conflict' });
    await tick();
    http.expectOne(isList).flush([floor(0), floor(1), floor(2)]);

    expect(await moving).toBe(false);
    expect(store.items()).toHaveLength(3);
    expect(store.reorderError()).toContain('changed by someone else');
  });
});
