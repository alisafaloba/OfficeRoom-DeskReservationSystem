import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideTestBackend } from '@app-testing/test-backend';
import { Role } from '@app/shared/auth/models/auth';
import { NotificationStore } from '@app/shared/notification/data/notification-store';
import { adminGuard, authGuard, guestGuard } from './auth-guard';
import { AuthStore } from './auth-store';

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('auth guards', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/home' } as RouterStateSnapshot;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideTestBackend()] });
  });

  async function logIn(role: Role = 'USER'): Promise<void> {
    const http = TestBed.inject(HttpTestingController);
    const result = TestBed.inject(AuthStore).login({ email: 'a@b.c', password: 'x' });
    http.expectOne('/api/v1/auth/login').flush({ accessToken: 't', tokenType: 'Bearer', expiresInSeconds: 1 });
    await tick();
    http.expectOne('/api/v1/users/me').flush({
      id: '1',
      email: 'a@b.c',
      role,
      twoFactorEnabled: false,
      createdAt: '2026-08-12T00:00:00Z',
    });
    await result;
  }

  it('redirects anonymous users to the login page and remembers the target', () => {
    const result = TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/login?returnUrl=%2Fhome');
  });

  it('lets logged-in users through', async () => {
    await logIn();
    expect(TestBed.runInInjectionContext(() => authGuard(route, state))).toBe(true);
  });

  it('lets anonymous users reach the login page', () => {
    expect(TestBed.runInInjectionContext(() => guestGuard(route, state))).toBe(true);
  });

  it('sends logged-in users away from the login page', async () => {
    await logIn();
    expect(TestBed.runInInjectionContext(() => guestGuard(route, state))).toBeInstanceOf(UrlTree);
  });

  describe('adminGuard', () => {
    const adminState = { url: '/admin/users' } as RouterStateSnapshot;
    const runAdminGuard = () => TestBed.runInInjectionContext(() => adminGuard(route, adminState));
    const notice = () => TestBed.inject(NotificationStore).message();

    it('lets admins through without a notice', async () => {
      await logIn('ADMIN');

      expect(runAdminGuard()).toBe(true);
      expect(notice()).toBeNull();
    });

    it('sends employees home with a notice', async () => {
      await logIn('USER');

      const result = runAdminGuard();

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/home');
      expect(notice()).toBe('This page is only available to administrators.');
    });

    it('sends anonymous users to the login page without a notice', () => {
      const result = runAdminGuard();

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/login?returnUrl=%2Fadmin%2Fusers');
      expect(notice()).toBeNull();
    });
  });
});
