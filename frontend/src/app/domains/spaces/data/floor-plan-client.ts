import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '@app/shared/config/util/app-config';
import { FloorPlanDocument, PLAN_SCHEMA_VERSION, PlanElement } from '@app/spaces/models/floor-plan';

/** GET/PUT /api/v1/floors/{id}/plan. A floor never saved loads as an empty plan with version null. */
@Injectable({ providedIn: 'root' })
export class FloorPlanClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).baseUrl;

  load(floorId: string): Observable<FloorPlanDocument> {
    return this.http.get<FloorPlanDocument>(this.url(floorId));
  }

  /** `version` is the one that was loaded; the backend answers 409 when someone saved in between. */
  save(floorId: string, version: number | null, elements: readonly PlanElement[]): Observable<FloorPlanDocument> {
    return this.http.put<FloorPlanDocument>(this.url(floorId), { version, schemaVersion: PLAN_SCHEMA_VERSION, elements });
  }

  private url(floorId: string): string {
    return `${this.baseUrl}/api/v1/floors/${floorId}/plan`;
  }
}
