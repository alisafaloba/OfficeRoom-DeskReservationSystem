import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { AuthStore } from '@app/shared/auth/data/auth-store';
import { Role } from '@app/shared/auth/models/auth';

const tick = () => new Promise((resolve) => setTimeout(resolve));

/**
 * Signs in through the real AuthStore against the HTTP testing backend, answering the login
 * and profile requests. Needs `provideTestBackend()` in the TestBed.
 */
export async function signInAs(role: Role): Promise<void> {
  const http = TestBed.inject(HttpTestingController);
  const result = TestBed.inject(AuthStore).login({ email: 'a@b.c', password: 'x' });
  http
    .expectOne('/api/v1/auth/login')
    .flush({ accessToken: 't', tokenType: 'Bearer', expiresInSeconds: 900 });
  await tick();
  http.expectOne('/api/v1/users/me').flush({
    id: '1',
    email: 'a@b.c',
    role,
    twoFactorEnabled: false,
    createdAt: '2026-10-29T00:00:00Z',
  });
  await result;
}
