import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '@app/shared/config/util/app-config';
import { Building, BuildingInput } from '@app/spaces/models/building';

/** Thin HTTP layer for `/api/v1/buildings` (reads for everyone, writes ADMIN-only). */
@Injectable({ providedIn: 'root' })
export class BuildingsClient {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(APP_CONFIG).baseUrl}/api/v1/buildings`;

  list(): Observable<Building[]> {
    return this.http.get<Building[]>(this.url);
  }

  get(id: string): Observable<Building> {
    return this.http.get<Building>(`${this.url}/${id}`);
  }

  create(input: BuildingInput): Observable<Building> {
    return this.http.post<Building>(this.url, input);
  }

  update(id: string, input: BuildingInput): Observable<Building> {
    return this.http.put<Building>(`${this.url}/${id}`, input);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
