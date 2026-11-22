import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideTestBackend } from '@app-testing/test-backend';
import { Resource } from '@app/spaces/models/resource';
import { ResourcesStore } from './resources-store';

const FLOOR_ID = 'f1';
const BASE_URL = `/api/v1/floors/${FLOOR_ID}/resources`;

const mockResource: Resource = {
  id: 'r1',
  floorId: FLOOR_ID,
  name: 'Desk 1',
  type: 'DESK',
  capacity: 1,
  notes: null,
  status: 'BOOKABLE',
  bookable: true,
  equipment: [],
  createdAt: '2026-11-10T00:00:00Z',
};

describe('ResourcesStore', () => {
  let store: ResourcesStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...provideTestBackend(), ResourcesStore],
    });
    store = TestBed.inject(ResourcesStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function loaded(resources: Resource[]): Promise<void> {
    const promise = store.load(FLOOR_ID);
    http.expectOne((r) => r.url === BASE_URL && r.method === 'GET').flush(resources);
    http.expectOne('/api/v1/equipment').flush([{ id: 'eq1', name: 'Monitor' }]);
    await promise;
  }

  it('loads resources and equipment catalogue', async () => {
    await loaded([mockResource]);

    expect(store.items()).toEqual([mockResource]);
    expect(store.equipmentCatalogue()).toEqual([{ id: 'eq1', name: 'Monitor' }]);
  });

  it('filters by type', async () => {
    await loaded([mockResource]);

    const promise = store.setTypeFilter(FLOOR_ID, 'DESK');
    const req = http.expectOne((r) => r.url === BASE_URL && r.params.get('type') === 'DESK');
    req.flush([mockResource]);
    await promise;

    expect(store.items().length).toBe(1);
    expect(store.typeFilter()).toBe('DESK');
  });

  it('handles 409 conflict when deleting a resource with future bookings', async () => {
    const removePromise = store.remove(FLOOR_ID, 'r1');
    const req = http.expectOne(`${BASE_URL}/r1`);
    req.flush({ message: 'Future bookings' }, { status: 409, statusText: 'Conflict' });
    const success = await removePromise;

    expect(success).toBe(false);
    expect(store.saveError()).toContain('future bookings');
  });
});
