import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideTestBackend } from '@app-testing/test-backend';
import { Building, BuildingInput, WEEKDAYS } from '@app/spaces/models/building';
import { BuildingsStore } from './buildings-store';

const building = (n: number): Building => ({
  id: `id-${n}`,
  name: `Building ${n}`,
  address: `${n} Main Street`,
  timeZone: 'Europe/Bucharest',
  openingHours: WEEKDAYS.map((dayOfWeek) => ({ dayOfWeek, opensAt: '08:00:00', closesAt: '18:00:00' })),
  floorCount: 0,
  createdAt: '2026-11-02T00:00:00Z',
});

const input: BuildingInput = {
  name: 'HQ',
  address: '1 Main Street',
  timeZone: 'Europe/Bucharest',
  openingHours: building(1).openingHours,
};

const isList = (r: { url: string; method: string }) => r.url === '/api/v1/buildings' && r.method === 'GET';

describe('BuildingsStore', () => {
  let store: BuildingsStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestBackend() });
    store = TestBed.inject(BuildingsStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the buildings into read-only signals', async () => {
    const loading = store.load();
    expect(store.loading()).toBe(true);
    http.expectOne(isList).flush([building(1), building(2)]);
    await loading;

    expect(store.items().map((b) => b.name)).toEqual(['Building 1', 'Building 2']);
    expect(store.loading()).toBe(false);
    expect(store.loadError()).toBeNull();
  });

  it('exposes a load error', async () => {
    const loading = store.load();
    http.expectOne(isList).flush({}, { status: 500, statusText: 'Error' });
    await loading;

    expect(store.loadError()).toBeTruthy();
    expect(store.items()).toEqual([]);
  });

  it('creates a building and reloads the list', async () => {
    const saving = store.create(input);
    const req = http.expectOne((r) => r.url === '/api/v1/buildings' && r.method === 'POST');
    expect(req.request.body).toEqual(input);
    req.flush(building(1));
    await Promise.resolve();
    http.expectOne(isList).flush([building(1)]);

    expect(await saving).toBe(true);
    expect(store.items()).toHaveLength(1);
  });

  it('updates a building by id', async () => {
    const saving = store.update('id-1', input);
    http.expectOne((r) => r.url === '/api/v1/buildings/id-1' && r.method === 'PUT').flush(building(1));
    await Promise.resolve();
    http.expectOne(isList).flush([building(1)]);

    expect(await saving).toBe(true);
  });

  it('deletes a building and reloads the list', async () => {
    const removing = store.remove('id-1');
    http.expectOne((r) => r.url === '/api/v1/buildings/id-1' && r.method === 'DELETE').flush(null);
    await Promise.resolve();
    http.expectOne(isList).flush([]);

    expect(await removing).toBe(true);
    expect(store.items()).toEqual([]);
  });

  it('maps a duplicate name to a message and keeps the dialog open', async () => {
    const saving = store.create(input);
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ code: 'BUILDING_NAME_ALREADY_IN_USE' }, { status: 409, statusText: 'Conflict' });

    expect(await saving).toBe(false);
    expect(store.saveError()).toContain('already exists');
    store.clearSaveError();
    expect(store.saveError()).toBeNull();
  });
});
