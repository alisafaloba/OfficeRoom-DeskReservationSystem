import { Pipe, PipeTransform } from '@angular/core';
import { Role } from '@app/shared/auth/models/auth';

/** Display names of the roles; `USER` is the Employee role of the specification. */
const ROLE_LABELS: Readonly<Record<Role, string>> = {
  ADMIN: $localize`:@@role.admin:Admin`,
  USER: $localize`:@@role.user:Employee`,
};

/** Shows a role by its translated display name — the API value itself is never shown. */
@Pipe({ name: 'roleLabel' })
export class RoleLabelPipe implements PipeTransform {
  transform(role: Role): string {
    return ROLE_LABELS[role];
  }
}
