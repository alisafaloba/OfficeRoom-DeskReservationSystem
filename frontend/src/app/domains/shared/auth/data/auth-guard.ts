import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { NotificationStore } from '@app/shared/notification/data/notification-store';
import { AuthStore } from './auth-store';

/** Protects routes: anonymous users are sent to the login page and return afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  return auth.isLoggedIn() ? true : loginRedirect(inject(Router), state.url);
};

/**
 * Admin-only routes. Self-sufficient — it also handles anonymous users, so a route cannot be
 * left half-protected by forgetting authGuard. This is UX only; the backend enforces the role.
 */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return loginRedirect(router, state.url);
  if (auth.isAdmin()) return true;

  inject(NotificationStore).show(
    $localize`:@@guard.adminOnly:This page is only available to administrators.`,
  );
  return router.createUrlTree(['/home']);
};

/** The login page itself is only for anonymous users. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return auth.isLoggedIn() ? router.createUrlTree(['/']) : true;
};

function loginRedirect(router: Router, returnUrl: string): UrlTree {
  return router.createUrlTree(['/login'], { queryParams: { returnUrl } });
}
