import { InjectionToken } from '@angular/core';

/** The current time; replaced in tests to book "today" at a fixed moment. */
export const NOW = new InjectionToken<() => Date>('NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
