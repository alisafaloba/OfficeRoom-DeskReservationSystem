import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '@app/shared/auth/data/auth-store';

/** Status only: the backend has no endpoints yet for setting up or turning off 2FA. */
@Component({
  selector: 'app-two-factor-settings',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './two-factor-settings.html',
})
export class TwoFactorSettings {
  protected readonly user = inject(AuthStore).user;
}
