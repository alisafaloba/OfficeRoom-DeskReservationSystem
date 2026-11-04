import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signInAs } from '@app-testing/sign-in';
import { provideTestBackend } from '@app-testing/test-backend';
import { AuthStore } from '@app/shared/auth/data/auth-store';
import { User } from '@app/shared/auth/models/auth';
import { Profile } from './profile';

const ME = '/api/v1/users/me';
const FLOOR_ONE_DESK = 'd0000000-0000-4000-8000-000000000003';

const USER: User = {
  id: '1',
  email: 'jane@example.com',
  role: 'USER',
  twoFactorEnabled: false,
  createdAt: '2026-10-29T00:00:00Z',
  firstName: 'Jane',
  lastName: 'Doe',
  department: 'Sales',
  preferences: { favoriteDeskId: null, defaultBuilding: null, defaultFloor: null },
};

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

  /** The store's promises resolve after a flush, so whenStable alone can run too early. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  async function open(user: User = USER): Promise<void> {
    fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    http.expectOne(ME).flush(user);
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

  it('offers a retry when loading fails', async () => {
    fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    http.expectOne(ME).flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(alerts()[0]).toContain('Something went wrong');

    page().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await settle();
    http.expectOne(ME).flush(USER);
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
    request.flush(USER);
  });

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

  it('explains the disabled Save on load when a required value is missing', async () => {
    await open({ ...USER, firstName: null });

    expect(alerts()).toEqual(['This field is required.']);
    expect(saveButton().disabled).toBe(true);
  });

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
      .flush(
        { code: 'VALIDATION_FAILED', errors: { department: 'Rejected by server' } },
        { status: 400, statusText: 'Bad Request' },
      );
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
      preferences: { favoriteDeskId: null, defaultBuilding: null, defaultFloor: null },
    });
    expect(saveButton().disabled).toBe(true);

    request.flush({ ...USER, firstName: 'Janet' });
    await settle();

    expect(saveButton().disabled).toBe(false);
    expect(status()).toBe('Your profile has been saved.');
    expect(input('first-name').value).toBe('Janet');
    expect(TestBed.inject(AuthStore).user()?.firstName).toBe('Janet');
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
        errors: { lastName: 'Rejected by server', 'preferences.defaultBuilding': 'Unknown building' },
      },
      { status: 400, statusText: 'Bad Request' },
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
      .flush(
        { code: 'VALIDATION_FAILED', errors: { somethingElse: 'Nope' } },
        { status: 400, statusText: 'Bad Request' },
      );
    await settle();

    expect(alerts()).toEqual(['Please check your input.']);
  });

  it.each([
    [409, { code: 'CONCURRENT_MODIFICATION' }, 'Your profile was changed elsewhere'],
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

  describe('preference pickers', () => {
    it('unlocks floor and desk one step at a time', async () => {
      await open();
      expect(select('floor').disabled).toBe(true);
      expect(select('desk').disabled).toBe(true);

      await choose('building', 'Headquarters');
      expect(select('floor').disabled).toBe(false);
      expect(select('desk').disabled).toBe(true);
      expect(optionsOf('floor')).toEqual(['None', 'Ground floor', 'Floor 1']);

      await choose('floor', 'Floor 1');
      expect(select('desk').disabled).toBe(false);
      expect(optionsOf('desk')).toEqual(['None', 'Desk 1.01', 'Desk 1.02', 'Desk 1.03']);
    });

    it('clears floor and desk when the building changes', async () => {
      await open();
      await choose('building', 'Headquarters');
      await choose('floor', 'Floor 1');
      await choose('desk', FLOOR_ONE_DESK);

      await choose('building', 'North Campus');

      expect(select('floor').value).toBe('');
      expect(select('desk').value).toBe('');
      expect(select('desk').disabled).toBe(true);
    });

    it('clears the desk when the floor changes', async () => {
      await open();
      await choose('building', 'Headquarters');
      await choose('floor', 'Floor 1');
      await choose('desk', FLOOR_ONE_DESK);

      await choose('floor', 'Ground floor');

      expect(select('desk').value).toBe('');
      expect(select('desk').disabled).toBe(false);
    });

    it('locks floor and desk again when the building goes back to None', async () => {
      await open();
      await choose('building', 'Headquarters');
      await choose('floor', 'Floor 1');
      await choose('desk', FLOOR_ONE_DESK);

      await choose('building', '');

      expect(select('floor').disabled).toBe(true);
      expect(select('desk').disabled).toBe(true);
      await submitForm();
      const request = http.expectOne(ME);
      expect(request.request.body.preferences).toEqual({
        defaultBuilding: null,
        defaultFloor: null,
        favoriteDeskId: null,
      });
      request.flush(USER);
    });

    it('sends the chosen values and shows saved ones after a reload', async () => {
      await open();
      await choose('building', 'Headquarters');
      await choose('floor', 'Floor 1');
      await choose('desk', FLOOR_ONE_DESK);

      await submitForm();
      const preferences = {
        defaultBuilding: 'Headquarters',
        defaultFloor: 'Floor 1',
        favoriteDeskId: FLOOR_ONE_DESK,
      };
      const request = http.expectOne(ME);
      expect(request.request.body.preferences).toEqual(preferences);
      request.flush({ ...USER, preferences });
      await settle();
      fixture.destroy();

      await open({ ...USER, preferences });

      expect(select('building').value).toBe('Headquarters');
      expect(select('floor').value).toBe('Floor 1');
      expect(select('desk').value).toBe(FLOOR_ONE_DESK);
    });

    it('does not keep saved values that are no longer in the catalog', async () => {
      await open({
        ...USER,
        preferences: { defaultBuilding: 'Demolished', defaultFloor: '9', favoriteDeskId: FLOOR_ONE_DESK },
      });

      expect(select('building').value).toBe('');
      await submitForm();
      const request = http.expectOne(ME);

      expect(request.request.body.preferences).toEqual({
        defaultBuilding: null,
        defaultFloor: null,
        favoriteDeskId: null,
      });
      request.flush(USER);
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
