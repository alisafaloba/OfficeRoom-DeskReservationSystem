import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Dumb flash-message banner: shows `message`, emits `dismissed` when closed. */
@Component({
  selector: 'app-notification-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-banner.html',
})
export class NotificationBanner {
  readonly message = input.required<string>();

  readonly dismissed = output<void>();
}
