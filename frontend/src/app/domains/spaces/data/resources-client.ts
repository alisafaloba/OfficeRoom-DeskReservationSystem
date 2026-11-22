import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '@app/shared/config/util/app-config';
import { Resource, ResourceInput, ResourceType } from '@app/spaces/models/resource';

@Injectable({ providedIn: 'root' })
export class ResourcesClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).baseUrl;

  list(
    floorId: string,
    filter?: { type?: ResourceType | null; equipmentId?: string | null }
  ): Observable<Resource[]> {
    let params = new HttpParams();
    if (filter?.type) params = params.set('type', filter.type);
    if (filter?.equipmentId) params = params.set('equipmentId', filter.equipmentId);

    return this.http.get<Resource[]>(this.url(floorId), { params });
  }

  get(floorId: string, resourceId: string): Observable<Resource> {
    return this.http.get<Resource>(`${this.url(floorId)}/${resourceId}`);
  }

  create(floorId: string, input: ResourceInput): Observable<Resource> {
    return this.http.post<Resource>(this.url(floorId), input);
  }

  update(floorId: string, resourceId: string, input: ResourceInput): Observable<Resource> {
    return this.http.put<Resource>(`${this.url(floorId)}/${resourceId}`, input);
  }

  delete(floorId: string, resourceId: string): Observable<void> {
    return this.http.delete<void>(`${this.url(floorId)}/${resourceId}`);
  }

  private url(floorId: string): string {
    return `${this.baseUrl}/api/v1/floors/${floorId}/resources`;
  }
}
