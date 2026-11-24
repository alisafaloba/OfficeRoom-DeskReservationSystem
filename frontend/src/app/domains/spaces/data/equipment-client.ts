import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '@app/shared/config/util/app-config';
import { Equipment } from '@app/spaces/models/resource';

@Injectable({ providedIn: 'root' })
export class EquipmentClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).baseUrl;

  list(): Observable<Equipment[]> {
    return this.http.get<Equipment[]>(`${this.baseUrl}/api/v1/equipment`);
  }

  create(name: string): Observable<Equipment> {
    return this.http.post<Equipment>(`${this.baseUrl}/api/v1/equipment`, { name });
  }
}
