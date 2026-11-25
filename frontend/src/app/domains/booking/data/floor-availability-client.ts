import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '@app/shared/config/util/app-config';
import { FloorAvailability } from '@app/booking/models/floor-availability';

/** Thin HTTP layer for `GET /api/v1/floors/{floorId}/availability` (E4.T1). */
@Injectable({ providedIn: 'root' })
export class FloorAvailabilityClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).baseUrl;

  /** `from` and `to` are UTC instants; the range is half-open and at most 31 days long. */
  forFloor(floorId: string, from: string, to: string): Observable<FloorAvailability> {
    return this.http.get<FloorAvailability>(
      `${this.baseUrl}/api/v1/floors/${floorId}/availability`,
      { params: new HttpParams().set('from', from).set('to', to) },
    );
  }
}
