import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { UpdateOwnProfileRequest, User } from '@app/shared/auth/models/auth';
import { ProfileStore } from '@app/profile/data/profile-store';
import { Building } from '@app/profile/models/space';

/** Every value is a string because native inputs and selects use '' for "nothing chosen". */
interface ProfileFormModel {
  firstName: string;
  lastName: string;
  department: string;
  defaultBuilding: string;
  defaultFloor: string;
  favoriteDeskId: string;
}

const MAX_LENGTH = 100;

const profileSchema = schema<ProfileFormModel>((path) => {
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
  disabled(path.defaultFloor, ({ valueOf }) => !valueOf(path.defaultBuilding));
  disabled(path.favoriteDeskId, ({ valueOf }) => !valueOf(path.defaultFloor));
});

/**
 * Preferences are kept only while they still exist in the catalog and fit together, so the
 * pickers never hide a value that a later save would send back.
 */
function toFormModel(user: User | null, buildings: readonly Building[]): ProfileFormModel {
  const preferences = user?.preferences;
  const building = buildings.find((b) => b.name === preferences?.defaultBuilding);
  const floor = building?.floors.find((f) => f.name === preferences?.defaultFloor);
  const desk = floor?.desks.find((d) => d.id === preferences?.favoriteDeskId);
  return {
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    department: user?.department ?? '',
    defaultBuilding: building?.name ?? '',
    defaultFloor: floor?.name ?? '',
    favoriteDeskId: desk?.id ?? '',
  };
}

function toRequest(model: ProfileFormModel): UpdateOwnProfileRequest {
  return {
    firstName: model.firstName.trim(),
    lastName: model.lastName.trim(),
    department: model.department.trim() || null,
    preferences: {
      favoriteDeskId: model.favoriteDeskId || null,
      defaultBuilding: model.defaultBuilding || null,
      defaultFloor: model.defaultFloor || null,
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

  protected readonly model = linkedSignal(() =>
    toFormModel(this.store.profile(), this.store.buildings()),
  );
  protected readonly form = form(this.model, profileSchema);

  protected readonly floors = computed(
    () => this.store.buildings().find((b) => b.name === this.model().defaultBuilding)?.floors ?? [],
  );
  protected readonly desks = computed(
    () => this.floors().find((f) => f.name === this.model().defaultFloor)?.desks ?? [],
  );

  protected readonly saved = signal(false);
  protected readonly saveError = signal<string | null>(null);

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

  protected onBuildingChange(): void {
    this.model.update((m) => ({ ...m, defaultFloor: '', favoriteDeskId: '' }));
  }

  protected onFloorChange(): void {
    this.model.update((m) => ({ ...m, favoriteDeskId: '' }));
  }

  protected clearMessages(): void {
    this.saved.set(false);
    this.saveError.set(null);
  }

  protected async save(): Promise<void> {
    this.clearMessages();
    await submit(this.form, async () => {
      const failure = await this.store.save(toRequest(this.model()));
      if (!failure) {
        this.saved.set(true);
        return undefined;
      }
      const fields: Record<string, FieldTree<string> | undefined> = { ...this.form };
      const errors = Object.entries(failure.fieldErrors).flatMap(([name, message]) => {
        const fieldTree = fields[name];
        return fieldTree ? [{ kind: 'server', message, fieldTree }] : [];
      });
      // Nothing to show next to a field: the user still has to see that saving failed.
      if (errors.length === 0) this.saveError.set(failure.message);
      return errors;
    });
  }
}
