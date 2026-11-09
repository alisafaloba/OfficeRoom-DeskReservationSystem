import { Routes } from '@angular/router';
import { BuildingManagement } from '@app/spaces/feature-buildings/building-management';

/** Space management — mounted behind adminGuard in app.routes.ts. */
export const spacesRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'buildings' },
  { path: 'buildings', component: BuildingManagement },
];
