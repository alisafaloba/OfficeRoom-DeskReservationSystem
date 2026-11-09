import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { AuthStore } from '@app/shared/auth/data/auth-store';
import { ROLES, Role, User } from '@app/shared/auth/models/auth';
import { UserInput } from '@app/admin/data/users-client';
import { UsersStore } from '@app/admin/data/users-store';
import { ConfirmDialog } from '@app/admin/ui/confirm-dialog/confirm-dialog';
import { UserForm } from '@app/admin/ui/user-form/user-form';
import { RoleLabelPipe } from '@app/shared/auth/ui/role-label-pipe';

const SEARCH_DEBOUNCE_MS = 300;

/** Admin page: search, filter, create, edit, change role, deactivate and delete users. Only reachable through adminGuard. */
@Component({
  selector: 'app-user-management',
  imports: [DatePipe, UserForm, ConfirmDialog, RoleLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-management.html',
})
export class UserManagement implements OnInit, OnDestroy {
  private readonly user = inject(AuthStore).user;
  protected readonly store = inject(UsersStore);

  protected readonly roles = ROLES;

  protected readonly editing = signal<User | 'new' | null>(null);
  protected readonly editTarget = computed(() => {
    const e = this.editing();
    return e === 'new' ? null : e;
  });
  protected readonly deleting = signal<User | null>(null);
  protected readonly roleChanging = signal<User | null>(null);
  protected readonly pendingRole = signal<Role>('USER');
  protected readonly deactivating = signal<User | null>(null);
  protected readonly reactivating = signal<User | null>(null);

  protected readonly deleteHeading = $localize`:@@userManagement.deleteTitle:Delete user?`;
  protected readonly deleteLabel = $localize`:@@userManagement.confirmDelete:Delete`;
  protected readonly roleHeading = $localize`:@@userManagement.changeRoleTitle:Change role?`;
  protected readonly roleLabel = $localize`:@@userManagement.confirmChangeRole:Change role`;
  protected readonly deactivateHeading = $localize`:@@userManagement.deactivateTitle:Deactivate user?`;
  protected readonly deactivateLabel = $localize`:@@userManagement.confirmDeactivate:Deactivate`;
  protected readonly reactivateHeading = $localize`:@@userManagement.reactivateTitle:Reactivate user?`;
  protected readonly reactivateLabel = $localize`:@@userManagement.confirmReactivate:Reactivate`;
  protected readonly cancelLabel = $localize`:@@userForm.cancel:Cancel`;

  private textTimer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    void this.store.load(0);
  }

  ngOnDestroy(): void {
    clearTimeout(this.textTimer);
  }

  // ── Search and filters ────────────────────────────────────────────────────

  /** Typing waits for a short pause before asking the server. */
  protected onSearch(value: string): void {
    this.debounced(() => this.store.setFilters({ q: value }));
  }

  protected onDepartment(value: string): void {
    this.debounced(() => this.store.setFilters({ department: value }));
  }

  protected onRole(value: string): void {
    void this.store.setFilters({ role: value as Role | '' });
  }

  protected onStatus(value: string): void {
    void this.store.setFilters({ status: value as '' | 'active' | 'inactive' });
  }

  private debounced(action: () => Promise<void>): void {
    clearTimeout(this.textTimer);
    this.textTimer = setTimeout(() => void action(), SEARCH_DEBOUNCE_MS);
  }

  // ── Row helpers ───────────────────────────────────────────────────────────

  protected isSelf(target: User): boolean {
    return target.id === this.user()?.id;
  }

  protected isActive(target: User): boolean {
    return target.active !== false;
  }

  protected displayName(target: User): string {
    const name = [target.firstName, target.lastName].filter((part) => !!part).join(' ');
    return name === '' ? '—' : name;
  }

  // ── Dialogs ───────────────────────────────────────────────────────────────

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

  protected openRoleChange(target: User): void {
    this.store.clearSaveError();
    this.pendingRole.set(target.role);
    this.roleChanging.set(target);
  }

  protected setPendingRole(value: string): void {
    this.pendingRole.set(value === 'ADMIN' ? 'ADMIN' : 'USER');
  }

  protected openDeactivate(target: User): void {
    this.store.clearSaveError();
    this.deactivating.set(target);
  }

  protected openReactivate(target: User): void {
    this.store.clearSaveError();
    this.reactivating.set(target);
  }

  protected closeDialogs(): void {
    this.editing.set(null);
    this.deleting.set(null);
    this.roleChanging.set(null);
    this.deactivating.set(null);
    this.reactivating.set(null);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

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

  protected async confirmRoleChange(): Promise<void> {
    const target = this.roleChanging();
    if (target === null) return;
    if (this.pendingRole() === target.role) {
      this.roleChanging.set(null);
      return;
    }
    if (await this.store.changeRole(target.id, this.pendingRole())) this.roleChanging.set(null);
  }

  protected async confirmDeactivate(): Promise<void> {
    const target = this.deactivating();
    if (target === null) return;
    if (await this.store.deactivate(target.id)) this.deactivating.set(null);
  }

  protected async confirmReactivate(): Promise<void> {
    const target = this.reactivating();
    if (target === null) return;
    if (await this.store.reactivate(target.id)) this.reactivating.set(null);
  }
}
