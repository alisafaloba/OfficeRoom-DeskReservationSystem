import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  DeskBooking,
  DeskBookingInput,
  DeskBookingSettings,
} from '@app/booking/models/desk-booking';
import { DeskBookingClient } from './desk-booking-client';

/**
 * State of one desk booking dialog (E5.T3). Provided by the page that opens the dialog (the floor
 * plan viewer), so every dialog starts clean.
 */
@Injectable()
export class DeskBookingStore {
  private readonly client = inject(DeskBookingClient);

  private readonly _settings = signal<DeskBookingSettings | null>(null);
  private readonly _saving = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _confirmation = signal<DeskBooking | null>(null);

  /** `null` until loaded; the booking form needs them to preview the slots. */
  readonly settings = this._settings.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly error = this._error.asReadonly();
  /** The stored booking once the server accepted it. */
  readonly confirmation = this._confirmation.asReadonly();

  /** Loads the settings once; later calls reuse them. Failures land in `error`. */
  async loadSettings(): Promise<void> {
    if (this._settings()) return;
    try {
      this._settings.set(await firstValueFrom(this.client.settings()));
    } catch (error) {
      this._error.set(describe(error));
    }
  }

  /** Resolves to the booking, or `null` when the server refused it (see `error`). */
  async book(input: DeskBookingInput): Promise<DeskBooking | null> {
    this._saving.set(true);
    this._error.set(null);
    try {
      const booking = await firstValueFrom(this.client.book(input));
      this._confirmation.set(booking);
      return booking;
    } catch (error) {
      this._error.set(describe(error));
      return null;
    } finally {
      this._saving.set(false);
    }
  }

  /** Forgets the last result, for the next dialog. */
  reset(): void {
    this._error.set(null);
    this._confirmation.set(null);
  }
}

function codeOf(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse
    ? (error.error as { code?: string } | null)?.code
    : undefined;
}

function describe(error: unknown): string {
  switch (codeOf(error)) {
    case 'BOOKING_CONFLICT':
      return $localize`:@@deskBooking.err.conflict:This place is already booked for that time. Pick another time or place.`;
    case 'USER_ALREADY_HAS_DESK':
      return $localize`:@@deskBooking.err.alreadyHasDesk:You already have a place of this kind booked for that time.`;
    case 'RESOURCE_UNAVAILABLE':
      return $localize`:@@deskBooking.err.unavailable:This place is not available at that time.`;
    case 'OUTSIDE_OPENING_HOURS':
      return $localize`:@@deskBooking.err.outsideHours:The building is closed at this time.`;
    case 'BOOKING_IN_PAST':
      return $localize`:@@deskBooking.err.inPast:This time has already passed.`;
    case 'BOOKING_TOO_FAR_AHEAD':
      return $localize`:@@deskBooking.err.tooFarAhead:This date is too far ahead to book.`;
    case 'INVALID_TIME_RANGE':
      return $localize`:@@deskBooking.err.range:The start time must be before the end time.`;
    case 'RESOURCE_NOT_BOOKABLE':
      return $localize`:@@deskBooking.err.notBookable:This place cannot be booked.`;
    case 'RESOURCE_NOT_FOUND':
      return $localize`:@@deskBooking.err.notFound:This place no longer exists.`;
    case 'VALIDATION_FAILED':
      return $localize`:@@deskBooking.err.validation:Please check your input.`;
  }
  if (error instanceof HttpErrorResponse && error.status === 0) {
    return $localize`:@@deskBooking.err.unreachable:The server is not reachable.`;
  }
  return $localize`:@@deskBooking.err.generic:Something went wrong. Please try again.`;
}
