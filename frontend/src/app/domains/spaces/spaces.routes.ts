import { Routes } from '@angular/router';
import { BuildingManagement } from '@app/spaces/feature-buildings/building-management';
import { FloorManagement } from '@app/spaces/feature-floors/floor-management';

/** Space management — mounted behind adminGuard in app.routes.ts. */
export const spacesRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'buildings' },
  { path: 'buildings', component: BuildingManagement },
  { path: 'buildings/:buildingId/floors', component: FloorManagement },
];
