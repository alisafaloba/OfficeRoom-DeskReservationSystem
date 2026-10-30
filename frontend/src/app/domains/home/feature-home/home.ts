import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthStore } from '@app/shared/auth/data/auth-store';
import { RoleLabelPipe } from '@app/shared/auth/ui/role-label-pipe';

/** Landing page for every signed-in user. */
@Component({
  selector: 'app-home',
  imports: [RoleLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
})
export class Home {
  protected readonly user = inject(AuthStore).user;
}
