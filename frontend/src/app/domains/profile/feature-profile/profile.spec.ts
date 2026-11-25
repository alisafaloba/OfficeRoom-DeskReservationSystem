import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signInAs } from '@app-testing/sign-in';
import { provideTestBackend } from '@app-testing/test-backend';
import { AuthStore } from '@app/shared/auth/data/auth-store';
import { User } from '@app/shared/auth/models/auth';
import { Building } from '@app/spaces/models/building';
import { Floor } from '@app/spaces/models/floor';
import { Resource } from '@app/spaces/models/resource';
import { Profile } from './profile';

const ME = '/api/v1/users/me';
const BUILDINGS = '/api/v1/buildings';
const floorsUrl = (buildingId: string) => `/api/v1/buildings/${buildingId}/floors`;
const desksUrl = (floorId: string) => `/api/v1/floors/${floorId}/resources`;

const building = (id: string, name: string) => ({ id, name }) as Building;
const floor = (id: string, buildingId: string, name: string) => ({ id, buildingId, name }) as Floor;
const desk = (id: string, floorId: string, name: string) =>
  ({ id, floorId, name, type: 'DESK', bookable: true }) as Resource;

interface Catalog {
  buildings: Building[];
  floors: Record<string, Floor[]>;
  desks: Record<string, Resource[]>;
}

const CATALOG: Catalog = {
  buildings: [building('b1', 'Headquarters'), building('b2', 'North Campus')],
  floors: {
    b1: [floor('f1', 'b1', 'Ground floor'), floor('f2', 'b1', 'Floor 1')],
    b2: [floor('f3', 'b2', 'Annex'), floor('f4', 'b2', 'Empty floor')],
  },
  desks: {
    f1: [desk('d3', 'f1', 'Desk G.01')],
    f2: [desk('d1', 'f2', 'Desk 1.01'), desk('d2', 'f2', 'Desk 1.02')],
    f3: [desk('d4', 'f3', 'Desk A.01')],
    f4: [],
  },
};

const USER: User = {
  id: '1',
  email: 'jane@example.com',
  role: 'USER',
  twoFactorEnabled: false,
  createdAt: '2026-10-29T00:00:00Z',
  firstName: 'Jane',
  lastName: 'Doe',
  department: 'Sales',
  preferences: { favoriteDeskId: null, defaultBuildingId: null, defaultFloorId: null },
};

const WITH_PREFERENCES: User = {
  ...USER,
  preferences: { defaultBuildingId: 'b1', defaultFloorId: 'f2', favoriteDeskId: 'd2' },
};

const BAD_REQUEST = { status: 400, statusText: 'Bad Request' };
const NOT_FOUND = { status: 404, statusText: 'Not Found' };
const SERVER_ERROR = { status: 500, statusText: 'Server Error' };

describe('Profile page', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Profile>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideTestBackend()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const page = () => fixture.nativeElement as HTMLElement;
  const input = (id: string) => page().querySelector<HTMLInputElement>(`#profile-${id}`)!;
  const select = (id: string) => page().querySelector<HTMLSelectElement>(`#profile-${id}`)!;
  const saveButton = () => page().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const alerts = () => Array.from(page().querySelectorAll('[role="alert"]'), (a) => a.textContent?.trim());
  const status = () => page().querySelector('[role="status"]')?.textContent?.trim();
  const optionsOf = (id: string) => Array.from(select(id).options, (o) => o.text);
  const desksRequest = (floorId: string) =>
    http.expectOne((r) => r.url === desksUrl(floorId) && r.params.get('type') === 'DESK');

  /** The store's promises resolve after a flush, so whenStable alone can run too early. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  /** Opens the page and answers every request the saved preferences cause. */
  async function open(user: User = USER, catalog: Catalog = CATALOG): Promise<void> {
    fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    http.expectOne(ME).flush(user);
    http.expectOne(BUILDINGS).flush(catalog.buildings);
    await settle();

    const savedBuilding = user.preferences?.defaultBuildingId;
    if (!savedBuilding || !catalog.buildings.some((b) => b.id === savedBuilding)) return;
    http.expectOne(floorsUrl(savedBuilding)).flush(catalog.floors[savedBuilding]);
    await settle();

    const savedFloor = user.preferences?.defaultFloorId;
    if (!savedFloor || !catalog.floors[savedBuilding].some((f) => f.id === savedFloor)) return;
    desksRequest(savedFloor).flush(catalog.desks[savedFloor]);
    await settle();
  }

  async function type(id: string, value: string): Promise<void> {
    const el = input(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function choose(id: string, value: string): Promise<void> {
    const el = select(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  }

  async function chooseBuilding(id: string): Promise<void> {
    await choose('building', id);
    if (id) {
      http.expectOne(floorsUrl(id)).flush(CATALOG.floors[id]);
      await settle();
    }
  }

  async function chooseFloor(id: string): Promise<void> {
    await choose('floor', id);
    if (id) {
      desksRequest(id).flush(CATALOG.desks[id]);
      await settle();
    }
  }

  async function submitForm(): Promise<void> {
    saveButton().click();
    await settle();
  }

  it('loads the profile into the form', async () => {
    await open();

    expect(input('first-name').value).toBe('Jane');
    expect(input('last-name').value).toBe('Doe');
    expect(input('department').value).toBe('Sales');
  });

  it('shows a loading message until the profile arrives', () => {
    fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();

    expect(status()).toBe('Loading your profile…');
    expect(page().querySelector('form')).toBeNull();

    http.expectOne(ME);
    http.expectOne(BUILDINGS);
  });

  it('offers a retry when loading fails', async () => {
    fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    http.expectOne(ME).flush(null, SERVER_ERROR);
    http.expectOne(BUILDINGS).flush(CATALOG.buildings);
    await settle();

    expect(alerts()[0]).toContain('Something went wrong');

    page().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await settle();
    http.expectOne(ME).flush(USER);
    http.expectOne(BUILDINGS).flush(CATALOG.buildings);
    await settle();

    expect(input('first-name').value).toBe('Jane');
  });

  it('shows the e-mail read-only and never sends it', async () => {
    await open();

    expect(input('email').value).toBe('jane@example.com');
    expect(input('email').readOnly).toBe(true);

    await submitForm();
    const request = http.expectOne(ME);

    expect(request.request.body).not.toHaveProperty('email');
    expect(request.request.body).not.toHaveProperty('role');
    request.flush(USER);
  });

  describe('validation', () => {
    it('shows validation messages without submitting and disables Save', async () => {
      await open();
      expect(saveButton().disabled).toBe(false);

      await type('first-name', '');

      expect(alerts()).toEqual(['This field is required.']);
      expect(input('first-name').getAttribute('aria-invalid')).toBe('true');
      expect(saveButton().disabled).toBe(true);
    });

    it('rejects names made only of spaces, as the backend does', async () => {
      await open();

      await type('last-name', '   ');

      expect(alerts()).toEqual(['This field is required.']);
      expect(saveButton().disabled).toBe(true);
    });

    it('rejects text longer than the backend allows', async () => {
      await open();

      await type('department', 'x'.repeat(101));

      expect(alerts()).toEqual(['Use at most 100 characters.']);
      expect(saveButton().disabled).toBe(true);
    });

    it('accepts text of exactly the maximum length', async () => {
      await open();

      await type('department', 'x'.repeat(100));

      expect(alerts()).toEqual([]);
      expect(saveButton().disabled).toBe(false);
    });

    it('lets the user clear the department, which is optional', async () => {
      await open();

      await type('department', '');
      await submitForm();
      const request = http.expectOne(ME);

      expect(request.request.body.department).toBeNull();
      request.flush({ ...USER, department: null });
    });

    it('explains the disabled Save on load when a required value is missing', async () => {
      await open({ ...USER, firstName: null });

      expect(alerts()).toEqual(['This field is required.']);
      expect(saveButton().disabled).toBe(true);
    });
  });

  describe('saving', () => {
    it('returns focus to Save after a successful save', async () => {
      await open();

      await submitForm();
      http.expectOne(ME).flush(USER);
      await settle();

      expect(document.activeElement).toBe(saveButton());
    });

    it('moves focus to the rejected field after a server validation error', async () => {
      await open();

      await submitForm();
      http
        .expectOne(ME)
        .flush({ code: 'VALIDATION_FAILED', errors: { department: 'Rejected by server' } }, BAD_REQUEST);
      await settle();

      expect(document.activeElement).toBe(input('department'));
    });

    it('disables Save while saving and confirms success', async () => {
      await signInAs('USER');
      await open();
      await type('first-name', '  Janet ');

      await submitForm();
      const request = http.expectOne(ME);

      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({
        firstName: 'Janet',
        lastName: 'Doe',
        department: 'Sales',
        preferences: { favoriteDeskId: null, defaultBuildingId: null, defaultFloorId: null },
      });
      expect(saveButton().disabled).toBe(true);
      // Inputs are locked by their <fieldset>, which :disabled sees but the .disabled property does not.
      expect(input('first-name').matches(':disabled')).toBe(true);

      request.flush({ ...USER, firstName: 'Janet' });
      await settle();

      expect(saveButton().disabled).toBe(false);
      expect(status()).toBe('Your profile has been saved.');
      expect(input('first-name').value).toBe('Janet');
      expect(TestBed.inject(AuthStore).user()?.firstName).toBe('Janet');
    });

    it('sends one request when Save is clicked twice', async () => {
      await open();

      saveButton().click();
      saveButton().click();
      await settle();

      http.expectOne(ME).flush(USER);
    });

    it('removes the confirmation on the next edit', async () => {
      await open();
      await submitForm();
      http.expectOne(ME).flush(USER);
      await settle();
      expect(status()).toBeDefined();

      await type('department', 'Product');

      expect(status()).toBeUndefined();
    });

    it('shows server validation errors next to their fields until the field changes', async () => {
      await open();

      await submitForm();
      http.expectOne(ME).flush(
        {
          code: 'VALIDATION_FAILED',
          errors: { lastName: 'Rejected by server', 'preferences.defaultBuildingId': 'Unknown building' },
        },
        BAD_REQUEST,
      );
      await settle();

      expect(alerts()).toEqual(['Rejected by server', 'Unknown building']);
      expect(status()).toBeUndefined();

      await type('last-name', 'Smith');

      expect(alerts()).toEqual(['Unknown building']);
    });

    it('shows validation errors for unknown fields as a general message', async () => {
      await open();

      await submitForm();
      http
        .expectOne(ME)
        .flush({ code: 'VALIDATION_FAILED', errors: { somethingElse: 'Nope' } }, BAD_REQUEST);
      await settle();

      expect(alerts()).toEqual(['Please check your input.']);
    });

    it.each([
      [409, { code: 'CONCURRENT_MODIFICATION' }, 'Your profile was changed elsewhere'],
      [404, { code: 'USER_NOT_FOUND' }, 'This account no longer exists'],
      [500, { code: 'INTERNAL_ERROR' }, 'Something went wrong'],
    ])('shows a %i response above Save and allows another try', async (code, body, text) => {
      await open();

      await submitForm();
      http.expectOne(ME).flush(body, { status: code, statusText: 'Error' });
      await settle();

      expect(alerts()[0]).toContain(text);
      expect(saveButton().disabled).toBe(false);
    });

    it('reports an unreachable server', async () => {
      await open();

      await submitForm();
      http.expectOne(ME).error(new ProgressEvent('error'));
      await settle();

      expect(alerts()).toEqual(['The server is not reachable.']);
    });
  });

  describe('preference pickers', () => {
    it('unlocks floor and desk one step at a time, loading each list when needed', async () => {
      await open();
      expect(select('floor').disabled).toBe(true);
      expect(select('desk').disabled).toBe(true);
      expect(optionsOf('building')).toEqual(['None', 'Headquarters', 'North Campus']);

      await chooseBuilding('b1');
      expect(select('floor').disabled).toBe(false);
      expect(select('desk').disabled).toBe(true);
      expect(optionsOf('floor')).toEqual(['None', 'Ground floor', 'Floor 1']);

      await chooseFloor('f2');
      expect(select('desk').disabled).toBe(false);
      expect(optionsOf('desk')).toEqual(['None', 'Desk 1.01', 'Desk 1.02']);
    });

    it('locks the next picker and Save while its options are loading', async () => {
      await open();

      await choose('building', 'b1');

      expect(select('floor').disabled).toBe(true);
      expect(optionsOf('floor')).toEqual(['Loading…']);
      expect(saveButton().disabled).toBe(true);

      http.expectOne(floorsUrl('b1')).flush(CATALOG.floors['b1']);
      await settle();

      expect(select('floor').disabled).toBe(false);
      expect(saveButton().disabled).toBe(false);
    });

    it('clears floor and desk when the building changes', async () => {
      await open(WITH_PREFERENCES);
      expect(select('desk').value).toBe('d2');

      await chooseBuilding('b2');

      expect(select('floor').value).toBe('');
      expect(select('desk').value).toBe('');
      expect(select('desk').disabled).toBe(true);
      expect(optionsOf('floor')).toEqual(['None', 'Annex', 'Empty floor']);
    });

    it('clears the desk when the floor changes', async () => {
      await open(WITH_PREFERENCES);

      await chooseFloor('f1');

      expect(select('desk').value).toBe('');
      expect(select('desk').disabled).toBe(false);
      expect(optionsOf('desk')).toEqual(['None', 'Desk G.01']);
    });

    it('locks floor and desk again when the building goes back to None', async () => {
      await open(WITH_PREFERENCES);

      await chooseBuilding('');

      expect(select('floor').disabled).toBe(true);
      expect(select('desk').disabled).toBe(true);
      await submitForm();
      const request = http.expectOne(ME);
      expect(request.request.body.preferences).toEqual({
        defaultBuildingId: null,
        defaultFloorId: null,
        favoriteDeskId: null,
      });
      request.flush(USER);
    });

    it('sends the chosen ids and shows them again after a reload', async () => {
      await open();
      await chooseBuilding('b1');
      await chooseFloor('f2');
      await choose('desk', 'd1');

      await submitForm();
      const preferences = { defaultBuildingId: 'b1', defaultFloorId: 'f2', favoriteDeskId: 'd1' };
      const request = http.expectOne(ME);
      expect(request.request.body.preferences).toEqual(preferences);
      request.flush({ ...USER, preferences });
      await settle();
      expect(select('desk').value).toBe('d1');
      fixture.destroy();

      await open({ ...USER, preferences });

      expect(select('building').value).toBe('b1');
      expect(select('floor').value).toBe('f2');
      expect(select('desk').value).toBe('d1');
      expect(optionsOf('desk')).toEqual(['None', 'Desk 1.01', 'Desk 1.02']);
    });

    it('keeps a desk-less choice (building and floor only)', async () => {
      await open();
      await chooseBuilding('b1');
      await chooseFloor('f1');

      await submitForm();
      const request = http.expectOne(ME);

      expect(request.request.body.preferences).toEqual({
        defaultBuildingId: 'b1',
        defaultFloorId: 'f1',
        favoriteDeskId: null,
      });
      request.flush(USER);
    });

    it('shows hints for a building without floors and a floor without desks', async () => {
      await open();

      await chooseBuilding('b2');
      await chooseFloor('f4');

      expect(page().textContent).toContain('This floor has no desks yet.');
      expect(select('desk').disabled).toBe(true);
    });

    it('says so when there are no buildings and keeps the form usable', async () => {
      await open(USER, { buildings: [], floors: {}, desks: {} });

      expect(page().textContent).toContain('There are no buildings yet.');
      expect(select('building').options.length).toBe(1);
      expect(saveButton().disabled).toBe(false);
    });

    it('says so when a building has no floors', async () => {
      await open();

      await choose('building', 'b2');
      http.expectOne(floorsUrl('b2')).flush([]);
      await settle();

      expect(page().textContent).toContain('This building has no floors yet.');
      expect(select('floor').disabled).toBe(true);
    });

    it('ignores a slow answer for a building that is no longer selected', async () => {
      await open();

      await choose('building', 'b1');
      const first = http.expectOne(floorsUrl('b1'));
      await choose('building', 'b2');
      const second = http.expectOne(floorsUrl('b2'));
      second.flush(CATALOG.floors['b2']);
      await settle();
      first.flush(CATALOG.floors['b1']);
      await settle();

      expect(optionsOf('floor')).toEqual(['None', 'Annex', 'Empty floor']);
    });

    it('shows the failure next to the pickers and retries from there', async () => {
      await open();

      await choose('building', 'b1');
      http.expectOne(floorsUrl('b1')).flush(null, SERVER_ERROR);
      await settle();

      expect(alerts()[0]).toContain('Something went wrong. Please try again.');
      expect(select('floor').disabled).toBe(true);
      expect(saveButton().disabled).toBe(false);

      page().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
      await settle();
      http.expectOne(floorsUrl('b1')).flush(CATALOG.floors['b1']);
      await settle();

      expect(alerts()).toEqual([]);
      expect(optionsOf('floor')).toEqual(['None', 'Ground floor', 'Floor 1']);
    });

    it('retries the desks when only they failed to load', async () => {
      await open();
      await chooseBuilding('b1');

      await choose('floor', 'f2');
      desksRequest('f2').flush(null, SERVER_ERROR);
      await settle();
      page().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
      await settle();
      desksRequest('f2').flush(CATALOG.desks['f2']);
      await settle();

      expect(alerts()).toEqual([]);
      expect(optionsOf('desk')).toEqual(['None', 'Desk 1.01', 'Desk 1.02']);
    });

    describe('a user whose preferences come from the demo seed', () => {
      // The ids the seed migration writes for Andrei Popescu: the Cluj building, its "Etajul 1" and a
      // desk on it. Before the preferences became ids, these were names and none of them matched.
      const SEED_BUILDING = 'b0000000-0000-0000-0000-000000000001';
      const SEED_FLOOR = 'f0000000-0000-0000-0000-000000000013';
      const SEED_DESK = 'd0000000-0000-0000-0000-000013000001';
      const SEED_CATALOG: Catalog = {
        buildings: [building(SEED_BUILDING, 'Sediul Central Cluj-Napoca')],
        floors: {
          [SEED_BUILDING]: [
            floor('f0000000-0000-0000-0000-000000000012', SEED_BUILDING, 'Parter'),
            floor(SEED_FLOOR, SEED_BUILDING, 'Etajul 1'),
          ],
        },
        desks: { [SEED_FLOOR]: [desk(SEED_DESK, SEED_FLOOR, 'Birou C-1-01')] },
      };
      const SEEDED: User = {
        ...USER,
        preferences: { defaultBuildingId: SEED_BUILDING, defaultFloorId: SEED_FLOOR, favoriteDeskId: SEED_DESK },
      };

      it('keeps the building, the floor and the favourite desk, without a notice', async () => {
        await open(SEEDED, SEED_CATALOG);

        expect(select('building').value).toBe(SEED_BUILDING);
        expect(select('floor').value).toBe(SEED_FLOOR);
        expect(select('desk').value).toBe(SEED_DESK);
        expect(page().querySelector('[role="note"]')).toBeNull();
      });

      it('sends the favourite desk back unchanged when only the name was edited', async () => {
        await open(SEEDED, SEED_CATALOG);

        await type('first-name', 'Andreea');
        await submitForm();
        const request = http.expectOne(ME);

        expect(request.request.body.preferences).toEqual({
          defaultBuildingId: SEED_BUILDING,
          defaultFloorId: SEED_FLOOR,
          favoriteDeskId: SEED_DESK,
        });
        request.flush(SEEDED);
      });
    });

    describe('saved values that no longer fit', () => {
      it('drops a building that was deleted', async () => {
        await open(WITH_PREFERENCES, { ...CATALOG, buildings: [building('b2', 'North Campus')] });

        expect(select('building').value).toBe('');
        expect(select('floor').disabled).toBe(true);
        await submitForm();
        const request = http.expectOne(ME);

        expect(request.request.body.preferences).toEqual({
          defaultBuildingId: null,
          defaultFloorId: null,
          favoriteDeskId: null,
        });
        request.flush(USER);
      });

      it('drops a building that disappears while its floors are loaded', async () => {
        fixture = TestBed.createComponent(Profile);
        fixture.detectChanges();
        http.expectOne(ME).flush(WITH_PREFERENCES);
        http.expectOne(BUILDINGS).flush(CATALOG.buildings);
        await settle();
        http.expectOne(floorsUrl('b1')).flush(null, NOT_FOUND);
        await settle();

        expect(input('first-name').value).toBe('Jane');
        expect(select('building').value).toBe('');
        expect(select('floor').disabled).toBe(true);
      });

      it('drops a floor that was deleted but keeps the building', async () => {
        await open(WITH_PREFERENCES, {
          ...CATALOG,
          floors: { ...CATALOG.floors, b1: [floor('f1', 'b1', 'Ground floor')] },
        });

        expect(select('building').value).toBe('b1');
        expect(select('floor').value).toBe('');
        expect(select('desk').value).toBe('');
      });

      it('drops a desk that was deleted but keeps building and floor', async () => {
        await open(WITH_PREFERENCES, {
          ...CATALOG,
          desks: { ...CATALOG.desks, f2: [desk('d1', 'f2', 'Desk 1.01')] },
        });

        expect(select('floor').value).toBe('f2');
        expect(select('desk').value).toBe('');
      });

      it('drops a desk saved without a floor, because its floor is unknown', async () => {
        await open({ ...USER, preferences: { favoriteDeskId: 'd1', defaultBuildingId: null, defaultFloorId: null } });

        expect(select('desk').value).toBe('');
        expect(select('desk').disabled).toBe(true);
      });

      it('fails the whole load instead of erasing preferences when the floors cannot be fetched', async () => {
        fixture = TestBed.createComponent(Profile);
        fixture.detectChanges();
        http.expectOne(ME).flush(WITH_PREFERENCES);
        http.expectOne(BUILDINGS).flush(CATALOG.buildings);
        await settle();
        http.expectOne(floorsUrl('b1')).flush(null, SERVER_ERROR);
        await settle();

        expect(alerts()[0]).toContain('Something went wrong');
        expect(page().querySelector('form')).toBeNull();
      });
    });

    describe('when a building or floor is deleted while the page is open', () => {
      const GONE = { status: 404, statusText: 'Not Found' };
      const notice = () => alerts().filter((a) => a?.includes('no longer exists'));
      const retryButtons = () => page().querySelectorAll('[role="alert"] button').length;

      it('resets the pickers, refreshes the buildings and offers no pointless retry', async () => {
        await open();

        await choose('building', 'b1');
        http.expectOne(floorsUrl('b1')).flush({ code: 'BUILDING_NOT_FOUND' }, GONE);
        await settle();
        http.expectOne(BUILDINGS).flush([building('b2', 'North Campus')]);
        await settle();

        expect(notice()).toEqual(['That building or floor no longer exists. Pick another one.']);
        expect(retryButtons()).toBe(0);
        expect(select('building').value).toBe('');
        expect(optionsOf('building')).toEqual(['None', 'North Campus']);
        expect(select('floor').disabled).toBe(true);
      });

      it('keeps the building and reloads its floors when only the floor is gone', async () => {
        await open();
        await chooseBuilding('b1');

        await choose('floor', 'f2');
        desksRequest('f2').flush({ code: 'FLOOR_NOT_FOUND' }, GONE);
        await settle();
        http.expectOne(BUILDINGS).flush(CATALOG.buildings);
        await settle();
        http.expectOne(floorsUrl('b1')).flush([floor('f1', 'b1', 'Ground floor')]);
        await settle();

        expect(notice()).toHaveLength(1);
        expect(retryButtons()).toBe(0);
        expect(select('building').value).toBe('b1');
        expect(select('floor').value).toBe('');
        expect(optionsOf('floor')).toEqual(['None', 'Ground floor']);
      });

      it('removes the notice on the next edit', async () => {
        await open();
        await choose('building', 'b1');
        http.expectOne(floorsUrl('b1')).flush({ code: 'BUILDING_NOT_FOUND' }, GONE);
        await settle();
        http.expectOne(BUILDINGS).flush(CATALOG.buildings);
        await settle();
        http.expectOne(floorsUrl('b1')).flush(CATALOG.floors['b1']);
        await settle();
        expect(notice()).toHaveLength(1);

        await type('department', 'Product');

        expect(notice()).toEqual([]);
      });
    });

    describe('saved preferences that were cleared', () => {
      const lostNotice = () => page().querySelector('[role="note"]')?.textContent?.trim();

      it('tells the user when a saved desk no longer exists, until they save', async () => {
        await open(WITH_PREFERENCES, {
          ...CATALOG,
          desks: { ...CATALOG.desks, f2: [desk('d1', 'f2', 'Desk 1.01')] },
        });

        expect(lostNotice()).toBe(
          'Some of your saved preferences are no longer available and were cleared. Save to confirm.',
        );

        await submitForm();
        http.expectOne(ME).flush(USER);
        await settle();

        expect(lostNotice()).toBeUndefined();
      });

      it.each([
        ['a deleted building', WITH_PREFERENCES, { ...CATALOG, buildings: [building('b2', 'North Campus')] }],
        [
          'a deleted floor',
          WITH_PREFERENCES,
          { ...CATALOG, floors: { ...CATALOG.floors, b1: [floor('f1', 'b1', 'Ground floor')] } },
        ],
        [
          'a desk saved without a floor',
          { ...USER, preferences: { favoriteDeskId: 'd1', defaultBuildingId: null, defaultFloorId: null } },
          CATALOG,
        ],
      ])('tells the user about %s', async (_name, user, catalog) => {
        await open(user, catalog);

        expect(lostNotice()).toContain('no longer available');
      });

      it('stays quiet when nothing was saved or everything still exists', async () => {
        await open();
        expect(lostNotice()).toBeUndefined();
        fixture.destroy();

        await open(WITH_PREFERENCES);
        expect(lostNotice()).toBeUndefined();
      });
    });

    describe('when the desk is rejected by the server', () => {
      it('resets the desk, refreshes the list and explains why', async () => {
        await open(WITH_PREFERENCES);

        await submitForm();
        http
          .expectOne(ME)
          .flush(
            { code: 'VALIDATION_FAILED', errors: { 'preferences.favoriteDeskId': 'Not a desk' } },
            BAD_REQUEST,
          );
        await settle();
        desksRequest('f2').flush([desk('d1', 'f2', 'Desk 1.01')]);
        await settle();

        expect(alerts()).toEqual(['The favourite desk is no longer available. Pick another one.']);
        expect(select('desk').value).toBe('');
        expect(optionsOf('desk')).toEqual(['None', 'Desk 1.01']);
        expect(saveButton().disabled).toBe(false);
      });
    });
  });

  describe('2FA', () => {
    const link = () =>
      Array.from(page().querySelectorAll('a')).find((a) => a.textContent?.includes('Two-factor settings'));

    it('links to the 2FA settings', async () => {
      await open();

      expect(link()?.getAttribute('href')).toBe('/profile/two-factor');
    });

    it('shows the current status', async () => {
      await open({ ...USER, twoFactorEnabled: true });

      expect(page().textContent).toContain('Two-factor authentication is on.');
    });
  });
});
