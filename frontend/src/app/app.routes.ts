import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from '@app/shared/auth/data/auth-guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadChildren: () => import('@app/account/account.routes').then((m) => m.accountRoutes),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadChildren: () => import('@app/home/home.routes').then((m) => m.homeRoutes),
  },
  {
    // adminGuard also handles anonymous users, so it needs no authGuard next to it.
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () => import('@app/admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
  {
    path: 'floor-plans',
    canActivate: [adminGuard],
    loadChildren: () => import('@app/spaces/floor-plan.routes').then((m) => m.floorPlanRoutes),
  },
  {
    path: 'spaces',
    canActivate: [adminGuard],
    loadChildren: () => import('@app/spaces/spaces.routes').then((m) => m.spacesRoutes),
  },
  { path: '**', redirectTo: 'home' },
];
