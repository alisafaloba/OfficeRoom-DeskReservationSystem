import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { AuthStore } from '@app/shared/auth/data/auth-store';
import { User } from '@app/shared/auth/models/auth';
import { UserInput } from '@app/admin/data/users-client';
import { UsersStore } from '@app/admin/data/users-store';
import { ConfirmDialog } from '@app/admin/ui/confirm-dialog/confirm-dialog';
import { UserForm } from '@app/admin/ui/user-form/user-form';
import { RoleLabelPipe } from '@app/shared/auth/ui/role-label-pipe';

/** Admin page: list, create, edit and delete users. Only reachable through adminGuard. */
@Component({
  selector: 'app-user-management',
  imports: [DatePipe, UserForm, ConfirmDialog, RoleLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-management.html',
})
export class UserManagement implements OnInit {
  private readonly user = inject(AuthStore).user;
  protected readonly store = inject(UsersStore);

  protected readonly editing = signal<User | 'new' | null>(null);
  protected readonly editTarget = computed(() => {
    const e = this.editing();
    return e === 'new' ? null : e;
  });
  protected readonly deleting = signal<User | null>(null);

  protected readonly deleteHeading = $localize`:@@userManagement.deleteTitle:Delete user?`;
  protected readonly deleteLabel = $localize`:@@userManagement.confirmDelete:Delete`;
  protected readonly cancelLabel = $localize`:@@userForm.cancel:Cancel`;

  ngOnInit(): void {
    void this.store.load(0);
  }

  protected openCreate(): void {
    this.store.clearSaveError();
    this.editing.set('new');
  }

  protected openEdit(target: User): void {
    this.store.clearSaveError();
    this.editing.set(target);
  }

  protected openDelete(target: User): void {
    this.store.clearSaveError();
    this.deleting.set(target);
  }

  protected closeDialogs(): void {
    this.editing.set(null);
    this.deleting.set(null);
  }

  protected isSelf(target: User): boolean {
    return target.id === this.user()?.id;
  }

  protected async save(input: UserInput): Promise<void> {
    const target = this.editing();
    if (target === null) return;
    const ok =
      target === 'new'
        ? await this.store.create(input)
        : await this.store.update(target.id, input);
    if (ok) this.editing.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleting();
    if (target === null) return;
    if (await this.store.remove(target.id)) this.deleting.set(null);
  }
}
