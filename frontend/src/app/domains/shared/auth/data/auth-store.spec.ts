import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideTestBackend } from '@app-testing/test-backend';
import { Role, User } from '@app/shared/auth/models/auth';
import { AuthStore } from './auth-store';

const user: User = {
  id: '1',
  email: 'admin@example.com',
  role: 'ADMIN',
  twoFactorEnabled: false,
  createdAt: '2026-08-12T00:00:00Z',
};
const tokens = { accessToken: 'access-1', tokenType: 'Bearer', expiresInSeconds: 900 };

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('AuthStore', () => {
  let auth: AuthStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestBackend() });
    auth = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function logInAs(role: Role): Promise<void> {
    const result = auth.login({ email: user.email, password: 'secret' });
    http.expectOne('/api/v1/auth/login').flush(tokens);
    await tick();
    http.expectOne('/api/v1/users/me').flush({ ...user, role });
    await result;
  }

  it('starts logged out', () => {
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.accessToken()).toBeNull();
    expect(auth.role()).toBeNull();
    expect(auth.isAdmin()).toBe(false);
  });

  it('exposes the role of a signed-in employee, who is not an admin', async () => {
    await logInAs('USER');

    expect(auth.role()).toBe('USER');
    expect(auth.isAdmin()).toBe(false);
  });

  it('exposes the role of a signed-in admin', async () => {
    await logInAs('ADMIN');

    expect(auth.role()).toBe('ADMIN');
    expect(auth.isAdmin()).toBe(true);
  });

  it('forgets the role on logout', async () => {
    await logInAs('ADMIN');

    const out = auth.logout();
    http.expectOne('/api/v1/auth/logout').flush(null);
    await out;

    expect(auth.role()).toBeNull();
    expect(auth.isAdmin()).toBe(false);
  });

  it('logs in, keeps the token in memory and loads the profile', async () => {
    const result = auth.login({ email: user.email, password: 'secret' });
    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.withCredentials).toBe(true);
    login.flush(tokens);
    await tick();
    http.expectOne('/api/v1/users/me').flush(user);

    expect(await result).toBe('success');
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.user()?.email).toBe(user.email);
    expect(auth.accessToken()).toBe('access-1');
  });

  it('reports a pending two-factor challenge without logging in', async () => {
    const result = auth.login({ email: user.email, password: 'secret' });
    http.expectOne('/api/v1/auth/login').flush({ challengeToken: 'c', expiresInSeconds: 300 });

    expect(await result).toBe('two-factor-required');
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('propagates a failed login and stays logged out', async () => {
    const result = auth.login({ email: user.email, password: 'wrong' });
    http.expectOne('/api/v1/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toBeDefined();
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('restores a session from the refresh cookie', async () => {
    const restored = auth.restoreSession();
    http.expectOne('/api/v1/auth/refresh').flush(tokens);
    await tick();
    http.expectOne('/api/v1/users/me').flush(user);
    await restored;

    expect(auth.isLoggedIn()).toBe(true);
  });

  it('stays anonymous when there is no refresh cookie', async () => {
    const restored = auth.restoreSession();
    http.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    await restored;

    expect(auth.isLoggedIn()).toBe(false);
  });

  it('shares one refresh request between concurrent callers', async () => {
    const first = auth.refresh();
    const second = auth.refresh();
    http.expectOne('/api/v1/auth/refresh').flush(tokens);
    await tick();
    http.expectOne('/api/v1/users/me').flush(user);

    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });

  it('clears the session on logout even if the server call fails', async () => {
    const login = auth.login({ email: user.email, password: 'secret' });
    http.expectOne('/api/v1/auth/login').flush(tokens);
    await tick();
    http.expectOne('/api/v1/users/me').flush(user);
    await login;

    const out = auth.logout();
    http.expectOne('/api/v1/auth/logout').flush({}, { status: 500, statusText: 'Error' });
    await out;

    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.accessToken()).toBeNull();
  });
});
