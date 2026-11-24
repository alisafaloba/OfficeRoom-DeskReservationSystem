import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '@app/shared/config/util/app-config';
import { FloorBackground, FloorBackgroundSettings } from '@app/spaces/models/floor-background';

/** Thin HTTP layer for `/api/v1/floors/{floorId}/background` (reads for everyone, writes ADMIN-only). */
@Injectable({ providedIn: 'root' })
export class FloorBackgroundClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).baseUrl;

  /** 404 with code FLOOR_BACKGROUND_NOT_FOUND when the floor has no image. */
  get(floorId: string): Observable<FloorBackground> {
    return this.http.get<FloorBackground>(this.url(floorId));
  }

  /** Fetched through HttpClient, not an `<img src>`, so the request carries the access token. */
  image(floorId: string): Observable<Blob> {
    return this.http.get(`${this.url(floorId)}/image`, { responseType: 'blob' });
  }

  upload(floorId: string, file: Blob, fileName: string): Observable<FloorBackground> {
    const form = new FormData();
    form.append('file', file, fileName);
    return this.http.put<FloorBackground>(this.url(floorId), form);
  }

  updateSettings(floorId: string, settings: FloorBackgroundSettings): Observable<FloorBackground> {
    return this.http.patch<FloorBackground>(this.url(floorId), settings);
  }

  delete(floorId: string): Observable<void> {
    return this.http.delete<void>(this.url(floorId));
  }

  private url(floorId: string): string {
    return `${this.baseUrl}/api/v1/floors/${floorId}/background`;
  }
}
