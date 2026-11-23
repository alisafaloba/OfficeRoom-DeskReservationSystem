import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '@app/shared/config/util/app-config';
import { Resource, ResourceType } from '@app/spaces/models/resource';

/** Thin HTTP layer for `/api/v1/floors/{floorId}/resources` (reads for everyone, writes ADMIN-only). */
@Injectable({ providedIn: 'root' })
export class ResourcesClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).baseUrl;

  /** Sorted by name; `type` narrows the list to one kind of resource. */
  list(floorId: string, type?: ResourceType): Observable<Resource[]> {
    const params = type ? new HttpParams().set('type', type) : undefined;
    return this.http.get<Resource[]>(`${this.baseUrl}/api/v1/floors/${floorId}/resources`, { params });
  }
}
