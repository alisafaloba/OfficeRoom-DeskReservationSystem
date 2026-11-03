import { Routes } from '@angular/router';
import { UserManagement } from '@app/admin/feature-user-management/user-management';

/** Admin area — mounted behind adminGuard in app.routes.ts. */
export const adminRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  { path: 'users', component: UserManagement },
];
