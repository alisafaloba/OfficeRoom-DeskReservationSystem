import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signInAs } from '@app-testing/sign-in';
import { provideTestBackend } from '@app-testing/test-backend';
import { UserManagement } from '@app/admin/feature-user-management/user-management';
import { Home } from '@app/home/feature-home/home';
import { NotificationStore } from '@app/shared/notification/data/notification-store';
import { routes } from './app.routes';

/** The real route table with its guards: what a user gets when typing an admin URL. */
describe('app routes', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...provideTestBackend()] });
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

  it('sends an anonymous visitor of an admin URL to the login page', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/admin/users');

    expect(currentUrl()).toBe('/login?returnUrl=%2Fadmin%2Fusers');
    expect(notice()).toBeNull();
  });
});
