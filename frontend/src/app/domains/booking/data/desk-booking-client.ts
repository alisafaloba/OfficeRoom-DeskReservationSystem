import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '@app/shared/config/util/app-config';
import {
  DeskBooking,
  DeskBookingInput,
  DeskBookingSettings,
} from '@app/booking/models/desk-booking';

/** Thin HTTP layer for `/api/v1/bookings/desk` (any signed-in user, for themselves). */
@Injectable({ providedIn: 'root' })
export class DeskBookingClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(APP_CONFIG).baseUrl;

  settings(): Observable<DeskBookingSettings> {
    return this.http.get<DeskBookingSettings>(`${this.baseUrl}/api/v1/bookings/desk/settings`);
  }

  book(input: DeskBookingInput): Observable<DeskBooking> {
    return this.http.post<DeskBooking>(`${this.baseUrl}/api/v1/bookings/desk`, input);
  }
}
