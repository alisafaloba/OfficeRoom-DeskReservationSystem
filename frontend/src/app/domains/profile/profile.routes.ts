import { Routes } from '@angular/router';
import { Profile } from '@app/profile/feature-profile/profile';
import { TwoFactorSettings } from '@app/profile/feature-two-factor/two-factor-settings';

/** Every signed-in user — mounted behind authGuard in app.routes.ts. */
export const profileRoutes: Routes = [
  { path: '', component: Profile },
  { path: 'two-factor', component: TwoFactorSettings },
];
