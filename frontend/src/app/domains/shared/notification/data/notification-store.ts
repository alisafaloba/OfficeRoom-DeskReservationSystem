import { Injectable, signal } from '@angular/core';

/**
 * A single flash message for the whole app (e.g. "access denied" after a guard redirect).
 * It stays until the user dismisses it or a newer message replaces it — clearing it on
 * navigation would wipe it during the very redirect that shows it.
 */
@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly _message = signal<string | null>(null);

  readonly message = this._message.asReadonly();

  show(message: string): void {
    this._message.set(message);
  }

  dismiss(): void {
    this._message.set(null);
  }
}
