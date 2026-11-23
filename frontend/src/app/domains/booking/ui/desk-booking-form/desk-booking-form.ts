import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  DESK_BOOKING_MODES,
  DeskBooking,
  DeskBookingInput,
  DeskBookingMode,
} from '@app/booking/models/desk-booking';
import { hhmm, hoursOn, presetSlot, timeSteps, todayIn } from '@app/booking/util/desk-slots';
import { Building } from '@app/spaces/models/building';

/**
 * Modal dialog to book one desk (E5.T3): a date, then Full day, Morning, Afternoon or a custom
 * slot in 15-minute steps. Every time is shown in the building's time zone. Emits the input;
 * the parent books it and passes back the error or the confirmation.
 */
@Component({
  selector: 'app-desk-booking-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './desk-booking-form.html',
})
export class DeskBookingForm {
  readonly resourceId = input.required<string>();
  readonly resourceName = input.required<string>();
  readonly building = input.required<Building>();
  /** Preselected date (`YYYY-MM-DD`), e.g. the one picked on the floor plan; defaults to today. */
  readonly initialDate = input<string | null>(null);
  readonly saving = input(false);
  readonly error = input<string | null>(null);
  /** Set once the booking is stored; the dialog then shows it instead of the form. */
  readonly confirmation = input<DeskBooking | null>(null);

  readonly submitted = output<DeskBookingInput>();
  readonly closed = output<void>();

  protected readonly modes = DESK_BOOKING_MODES;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly timeZone = computed(() => this.building().timeZone);
  protected readonly today = computed(() => todayIn(this.timeZone()));

  protected readonly date = linkedSignal(() => this.initialDate() ?? this.today());
  protected readonly mode = signal<DeskBookingMode>('FULL_DAY');

  /** The opening hours of the picked date, `null` when the building is closed. */
  protected readonly hours = computed(() => hoursOn(this.building(), this.date()));

  /** Custom start choices: every step from opening time up to the last one before closing. */
  protected readonly startChoices = computed(() => {
    const hours = this.hours();
    return hours ? timeSteps(hours.start, hours.end).slice(0, -1) : [];
  });
  protected readonly startTime = linkedSignal(() => this.startChoices()[0] ?? '');
  protected readonly endChoices = computed(() => {
    const hours = this.hours();
    const start = this.startTime();
    return hours ? timeSteps(hours.start, hours.end).filter((t) => t > start) : [];
  });
  protected readonly endTime = linkedSignal(() => this.endChoices()[0] ?? '');

  /** What each mode would book on the picked date, for the labels; `null` if it does not exist. */
  protected readonly presets = computed(() => {
    const hours = this.hours();
    return new Map(
      DESK_BOOKING_MODES.map((m) => [m, hours ? presetSlot(m, hours) : null] as const),
    );
  });

  protected readonly canSubmit = computed(() => {
    if (this.saving() || !this.hours() || this.date() < this.today()) return false;
    if (this.mode() === 'CUSTOM')
      return this.startTime() !== '' && this.endTime() > this.startTime();
    return this.presets().get(this.mode()) !== null;
  });

  protected readonly hhmm = hhmm;

  constructor() {
    // Native modal: focus trap, Escape and backdrop come from the browser.
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!el.open) el.showModal();
    });
    // A half day that does not exist on the new date falls back to the full day.
    effect(() => {
      const mode = this.mode();
      if (mode !== 'CUSTOM' && this.hours() && this.presets().get(mode) === null) {
        this.mode.set('FULL_DAY');
      }
    });
  }

  protected onDate(event: Event): void {
    this.date.set((event.target as HTMLInputElement).value);
  }

  protected onMode(mode: DeskBookingMode): void {
    this.mode.set(mode);
  }

  protected onStart(event: Event): void {
    this.startTime.set((event.target as HTMLSelectElement).value);
  }

  protected onEnd(event: Event): void {
    this.endTime.set((event.target as HTMLSelectElement).value);
  }

  protected save(): void {
    if (!this.canSubmit()) return;
    const base = { resourceId: this.resourceId(), date: this.date(), mode: this.mode() };
    this.submitted.emit(
      this.mode() === 'CUSTOM'
        ? { ...base, startTime: this.startTime(), endTime: this.endTime() }
        : base,
    );
  }
}
