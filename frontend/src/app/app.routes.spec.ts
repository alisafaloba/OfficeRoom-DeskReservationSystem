import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signInAs } from '@app-testing/sign-in';
import { provideTestBackend } from '@app-testing/test-backend';
import { BuildingManagement } from '@app/spaces/feature-buildings/building-management';
import { FloorManagement } from '@app/spaces/feature-floors/floor-management';
import { UserManagement } from '@app/admin/feature-user-management/user-management';
import { Home } from '@app/home/feature-home/home';
import { Profile } from '@app/profile/feature-profile/profile';
import { TwoFactorSettings } from '@app/profile/feature-two-factor/two-factor-settings';
import { BookDesk } from '@app/booking/feature-book-desk/book-desk';
import { FloorPlanEditor } from '@app/spaces/feature-floor-plan/floor-plan-editor';
import { NotificationStore } from '@app/shared/notification/data/notification-store';
import { routes } from './app.routes';

/** The real route table with its guards: what a user gets when typing an admin URL. */
describe('app routes', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), ...provideTestBackend()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function flushUserList(): void {
    http
      .expectOne((r) => r.method === 'GET' && r.url === '/api/v1/users')
      .flush({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } });
  }

  const currentUrl = () => TestBed.inject(Router).url;
  const notice = () => TestBed.inject(NotificationStore).message();

  it('opens user management for an admin', async () => {
    await signInAs('ADMIN');
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/admin/users', UserManagement);
    flushUserList();

    expect(currentUrl()).toBe('/admin/users');
    expect(notice()).toBeNull();
  });

  it('sends an admin from /admin to the user management page', async () => {
    await signInAs('ADMIN');
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/admin', UserManagement);
    flushUserList();

    expect(currentUrl()).toBe('/admin/users');
  });

  it('redirects an employee who opens an admin URL to home with a notice', async () => {
    await signInAs('USER');
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/admin/users', Home);

    expect(currentUrl()).toBe('/home');
    expect(notice()).toBe('This page is only available to administrators.');
  });

  it('opens "Book a desk" for an employee', async () => {
    await signInAs('USER');
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/book', BookDesk);
    http.expectOne('/api/v1/bookings/desk/settings').flush({ halfDaySplit: '13:00:00', maxDaysAhead: 90, stepMinutes: 15 });
    http.expectOne('/api/v1/buildings').flush([]);

    expect(currentUrl()).toBe('/book');
  });

  it('opens the floor plan editor for an admin', async () => {
    await signInAs('ADMIN');
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/floor-plans/some-floor', FloorPlanEditor);
    // The floor id reaches the editor from the URL: it loads that floor's background, resources and plan.
    http
      .expectOne('/api/v1/floors/some-floor/background')
      .flush({ code: 'FLOOR_BACKGROUND_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/v1/floors/some-floor/resources').flush([]);
    http
      .expectOne('/api/v1/floors/some-floor/plan')
      .flush({ floorId: 'some-floor', version: null, schemaVersion: 1, elements: [], updatedAt: null, updatedBy: null });

    expect(currentUrl()).toBe('/floor-plans/some-floor');
  });

  it('keeps an employee out of the floor plan editor', async () => {
    await signInAs('USER');
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/floor-plans/some-floor', Home);

    expect(currentUrl()).toBe('/home');
  });

  it.each(['USER', 'ADMIN'] as const)('opens the profile page for a signed-in %s', async (role) => {
    await signInAs(role);
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/profile', Profile);
    http.expectOne('/api/v1/users/me').flush({ id: '1', email: 'a@b.c', role });
    http.expectOne('/api/v1/buildings').flush([]);

    expect(currentUrl()).toBe('/profile');
  });

  it('follows the 2FA link from the profile page to a real page', async () => {
    await signInAs('USER');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/profile', Profile);
    http.expectOne('/api/v1/users/me').flush({ id: '1', email: 'a@b.c', role: 'USER' });
    http.expectOne('/api/v1/buildings').flush([]);
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    const link = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Two-factor settings'),
    );

    link?.click();
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();

    expect(currentUrl()).toBe('/profile/two-factor');
    expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(TwoFactorSettings);
    expect(harness.routeNativeElement?.textContent).toContain('Two-factor authentication is off.');
  });

  it('sends an anonymous visitor of the profile page to the login page', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/profile');

    expect(currentUrl()).toBe('/login?returnUrl=%2Fprofile');
  });

  it('sends an anonymous visitor of an admin URL to the login page', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/admin/users');

    expect(currentUrl()).toBe('/login?returnUrl=%2Fadmin%2Fusers');
    expect(notice()).toBeNull();
  });

  it('opens the buildings page for an admin and sends /spaces there', async () => {
    await signInAs('ADMIN');
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/spaces', BuildingManagement);
    http.expectOne((r) => r.method === 'GET' && r.url === '/api/v1/buildings').flush([]);

    expect(currentUrl()).toBe('/spaces/buildings');
  });

  it('redirects an employee who opens the buildings page to home with a notice', async () => {
    await signInAs('USER');
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/spaces/buildings', Home);

    expect(currentUrl()).toBe('/home');
    expect(notice()).toBe('This page is only available to administrators.');
  });

  it('opens the floors of a building for an admin, with the building id from the URL', async () => {
    await signInAs('ADMIN');
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/spaces/buildings/b1/floors', FloorManagement);
    http.expectOne((r) => r.method === 'GET' && r.url === '/api/v1/buildings/b1').flush({ id: 'b1', name: 'HQ' });
    http.expectOne((r) => r.method === 'GET' && r.url === '/api/v1/buildings/b1/floors').flush([]);

    expect(currentUrl()).toBe('/spaces/buildings/b1/floors');
  });

  it('keeps an employee out of the floors page', async () => {
    await signInAs('USER');
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/spaces/buildings/b1/floors', Home);

    expect(currentUrl()).toBe('/home');
  });
});
