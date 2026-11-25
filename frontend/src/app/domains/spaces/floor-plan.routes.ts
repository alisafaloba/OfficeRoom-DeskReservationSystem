import { Routes } from '@angular/router';
import { FloorPlanEditor } from '@app/spaces/feature-floor-plan/floor-plan-editor';

/**
 * Floor plan editor — mounted behind adminGuard in app.routes.ts. The floor id reaches the editor
 * as its `floorId` input; leaving with unsaved changes asks first.
 */
export const floorPlanRoutes: Routes = [
  { path: ':floorId', component: FloorPlanEditor, canDeactivate: [(editor: FloorPlanEditor) => editor.canLeave()] },
];
