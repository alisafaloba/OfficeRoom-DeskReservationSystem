import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  linkedSignal,
  OnInit,
  signal,
} from '@angular/core';
import {
  disabled,
  FieldTree,
  form,
  FormField,
  maxLength,
  pattern,
  required,
  schema,
  submit,
} from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { UpdateOwnProfileRequest } from '@app/shared/auth/models/auth';
import { LoadedProfile, ProfileStore } from '@app/profile/data/profile-store';

/** Every value is a string because native inputs and selects use '' for "nothing chosen". */
interface ProfileFormModel {
  firstName: string;
  lastName: string;
  department: string;
  defaultBuildingId: string;
  defaultFloorId: string;
  favoriteDeskId: string;
}

const MAX_LENGTH = 100;

function toFormModel(loaded: LoadedProfile | null): ProfileFormModel {
  return {
    firstName: loaded?.user.firstName ?? '',
    lastName: loaded?.user.lastName ?? '',
    department: loaded?.user.department ?? '',
    defaultBuildingId: loaded?.selection.building ?? '',
    defaultFloorId: loaded?.selection.floor ?? '',
    favoriteDeskId: loaded?.selection.desk ?? '',
  };
}

function toRequest(model: ProfileFormModel): UpdateOwnProfileRequest {
  return {
    firstName: model.firstName.trim(),
    lastName: model.lastName.trim(),
    department: model.department.trim() || null,
    preferences: {
      favoriteDeskId: model.favoriteDeskId || null,
      defaultBuildingId: model.defaultBuildingId || null,
      defaultFloorId: model.defaultFloorId || null,
    },
  };
}

/** The signed-in user's own profile and booking preferences. */
@Component({
  selector: 'app-profile',
  imports: [FormField, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.html',
})
export class Profile implements OnInit {
  protected readonly store = inject(ProfileStore);

  protected readonly model = linkedSignal(() => toFormModel(this.store.loaded()));
  protected readonly form = form(
    this.model,
    schema<ProfileFormModel>((path) => {
      const requiredMessage = $localize`:@@profile.required:This field is required.`;
      const tooLongMessage = $localize`:@@profile.tooLong:Use at most ${MAX_LENGTH}:max: characters.`;
      for (const name of [path.firstName, path.lastName]) {
        required(name, { message: requiredMessage });
        // The backend rejects names made only of spaces, which `required` alone accepts.
        pattern(name, /\S/, { message: requiredMessage });
      }
      for (const text of [path.firstName, path.lastName, path.department]) {
        maxLength(text, MAX_LENGTH, { message: tooLongMessage });
      }
      // Each picker waits for the one before it and for its own options to arrive.
      disabled(
        path.defaultFloorId,
        ({ valueOf }) =>
          !valueOf(path.defaultBuildingId) ||
          this.store.floorsLoading() ||
          this.store.floors().length === 0,
      );
      disabled(
        path.favoriteDeskId,
        ({ valueOf }) =>
          !valueOf(path.defaultFloorId) ||
          this.store.desksLoading() ||
          this.store.desks().length === 0,
      );
    }),
  );

  protected readonly saved = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** Said next to the pickers when a building or floor turned out to be deleted. */
  protected readonly pickerNotice = signal<string | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Disabling the focused Save button drops focus to the page, which strands keyboard and
    // screen reader users: return them to the first problem, or to Save if there is none.
    let wasSubmitting = false;
    afterRenderEffect(() => {
      const submitting = this.form().submitting();
      if (wasSubmitting && !submitting && document.activeElement === document.body) {
        this.host.nativeElement
          .querySelector<HTMLElement>('[aria-invalid="true"], button[type="submit"]')
          ?.focus();
      }
      wasSubmitting = submitting;
    });
  }

  ngOnInit(): void {
    void this.store.load();
  }

  protected async onBuildingChange(): Promise<void> {
    this.model.update((m) => ({ ...m, defaultFloorId: '', favoriteDeskId: '' }));
    if ((await this.store.selectBuilding(this.model().defaultBuildingId)) === 'gone') {
      await this.recoverFromGone();
    }
  }

  protected async onFloorChange(): Promise<void> {
    this.model.update((m) => ({ ...m, favoriteDeskId: '' }));
    if ((await this.store.selectFloor(this.model().defaultFloorId)) === 'gone') {
      await this.recoverFromGone();
    }
  }

  /** Asks again for whatever the pickers could not load: desks if a floor is chosen, else floors. */
  protected async retryOptions(): Promise<void> {
    const { defaultBuildingId, defaultFloorId } = this.model();
    const result = defaultFloorId
      ? await this.store.selectFloor(defaultFloorId)
      : await this.store.selectBuilding(defaultBuildingId);
    if (result === 'gone') await this.recoverFromGone();
  }

  protected clearMessages(): void {
    this.saved.set(false);
    this.saveError.set(null);
    this.pickerNotice.set(null);
  }

  protected async save(): Promise<void> {
    this.clearMessages();
    await submit(this.form, async () => {
      const { defaultBuildingId, defaultFloorId, favoriteDeskId } = this.model();
      const failure = await this.store.save(toRequest(this.model()), {
        building: defaultBuildingId,
        floor: defaultFloorId,
        desk: favoriteDeskId,
      });
      if (!failure) {
        this.saved.set(true);
        return undefined;
      }
      // A rejected desk is handled below: its picker is reset, so a message next to it would vanish.
      const deskRejected = 'favoriteDeskId' in failure.fieldErrors;
      const fields: Record<string, FieldTree<string> | undefined> = { ...this.form };
      const errors = Object.entries(failure.fieldErrors).flatMap(([name, message]) => {
        const fieldTree = fields[name];
        return fieldTree && !(deskRejected && name === 'favoriteDeskId')
          ? [{ kind: 'server', message, fieldTree }]
          : [];
      });
      if (deskRejected) this.dropUnavailableDesk();
      // Nothing to show next to a field: the user still has to see that saving failed.
      else if (errors.length === 0) this.saveError.set(failure.message);
      return errors;
    });
  }

  /**
   * The building or floor was deleted since the page was loaded, so asking again cannot help.
   * Refresh what is left, keep the choices that still exist and tell the user what happened.
   */
  private async recoverFromGone(): Promise<void> {
    await this.store.refreshBuildings();
    const buildingExists = this.store.buildings().some((b) => b.id === this.model().defaultBuildingId);
    this.model.update((m) => ({
      ...m,
      defaultBuildingId: buildingExists ? m.defaultBuildingId : '',
      defaultFloorId: '',
      favoriteDeskId: '',
    }));
    // Reloads the floors of a building that is still there and clears the lists otherwise.
    await this.store.selectBuilding(this.model().defaultBuildingId);
    this.pickerNotice.set(
      $localize`:@@profile.err.gone:That building or floor no longer exists. Pick another one.`,
    );
  }

  /** The desk was deleted since the list was loaded: refresh the list and stop offering it. */
  private dropUnavailableDesk(): void {
    this.model.update((m) => ({ ...m, favoriteDeskId: '' }));
    void this.store.selectFloor(this.model().defaultFloorId).then((result) => {
      if (result === 'gone') return this.recoverFromGone();
      return undefined;
    });
    this.saveError.set(
      $localize`:@@profile.err.deskGone:The favourite desk is no longer available. Pick another one.`,
    );
  }
}
