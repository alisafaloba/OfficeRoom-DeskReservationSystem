import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '@app/shared/config/util/app-config';
import { Floor, FloorInput } from '@app/spaces/models/floor';

/** Thin HTTP layer for `/api/v1/buildings/{buildingId}/floors` (reads for everyone, writes ADMIN-only). */
@Injectable({ providedIn: 'root' })
export class FloorsClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).baseUrl;

  /** Always in display order. */
  list(buildingId: string): Observable<Floor[]> {
    return this.http.get<Floor[]>(this.url(buildingId));
  }

  create(buildingId: string, input: FloorInput): Observable<Floor> {
    return this.http.post<Floor>(this.url(buildingId), input);
  }

  update(buildingId: string, floorId: string, input: FloorInput): Observable<Floor> {
    return this.http.put<Floor>(`${this.url(buildingId)}/${floorId}`, input);
  }

  delete(buildingId: string, floorId: string): Observable<void> {
    return this.http.delete<void>(`${this.url(buildingId)}/${floorId}`);
  }

  /** Sends every floor id of the building, first to last; answers the floors in that order. */
  reorder(buildingId: string, floorIds: readonly string[]): Observable<Floor[]> {
    return this.http.put<Floor[]>(`${this.url(buildingId)}/order`, { floorIds });
  }

  private url(buildingId: string): string {
    return `${this.baseUrl}/api/v1/buildings/${buildingId}/floors`;
  }
}
