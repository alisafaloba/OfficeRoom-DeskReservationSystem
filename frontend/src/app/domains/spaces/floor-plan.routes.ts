import { Routes } from '@angular/router';
import { FloorPlanEditor } from '@app/spaces/feature-floor-plan/floor-plan-editor';

/**
 * Floor plan editor — mounted behind adminGuard in app.routes.ts. The floor id is not used yet:
 * the plan lives in memory until floors and plan storage exist.
 */
export const floorPlanRoutes: Routes = [{ path: ':floorId', component: FloorPlanEditor }];
