import { Routes } from '@angular/router';
import { Profile } from '@app/profile/feature-profile/profile';
import { TwoFactorSettings } from '@app/profile/feature-two-factor/two-factor-settings';

export const profileRoutes: Routes = [
  { path: '', component: Profile },
  { path: 'two-factor', component: TwoFactorSettings },
];
