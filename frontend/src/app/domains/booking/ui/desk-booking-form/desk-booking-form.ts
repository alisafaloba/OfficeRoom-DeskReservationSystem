import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import {
  DESK_BOOKING_MODES,
  DeskBooking,
  DeskBookingInput,
  DeskBookingMode,
  DeskBookingSettings,
} from '@app/booking/models/desk-booking';
import {
  addDays,
  hhmm,
  hoursOn,
  LocalSlot,
  notBefore,
  presetSlot,
  timeSteps,
  zonedNow,
} from '@app/booking/util/desk-slots';
import { NOW } from '@app/booking/util/now';
import { Building } from '@app/spaces/models/building';

/**
 * Modal dialog to book one desk (E5.T3): a date, then Full day, Morning, Afternoon or a custom
 * slot on the server's time grid. Every time is shown in the building's time zone, and for today
 * the preview starts where the server will start (the next step mark from now). Emits the input;
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
  /** From the server: half-day split, horizon and time grid. */
  readonly settings = input.required<DeskBookingSettings>();
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
  private readonly clock = inject(NOW);

  protected readonly timeZone = computed(() => this.building().timeZone);
  private readonly step = computed(() => this.settings().stepMinutes);
  /** Read once per building: the dialog lives for a few minutes, the server has the last word. */
  private readonly now = computed(() => zonedNow(this.timeZone(), this.step(), this.clock()));
  protected readonly today = computed(() => this.now().date);
  protected readonly maxDaysAhead = computed(() => this.settings().maxDaysAhead);
  protected readonly lastDate = computed(() => addDays(this.today(), this.maxDaysAhead()));

  protected readonly date = linkedSignal(() => this.initialDate() ?? this.today());

  /**
   * The opening hours of the picked date, `null` when the building is closed. Compared by value,
   * so moving to a day with the same hours keeps everything that depends on them.
   */
  protected readonly hours = computed(() => hoursOn(this.building(), this.date()), {
    equal: sameSlot,
  });

  /** For today, nothing starts before this (`HH:mm`); `null` for later dates. */
  private readonly earliestStart = computed(() =>
    this.date() === this.today() ? this.now().earliestStart : null,
  );

  /**
   * What each mode would book on the picked date, for the labels; `null` if it does not exist or,
   * today, has already passed.
   */
  protected readonly presets = computed(() => {
    const hours = this.hours();
    const earliest = this.earliestStart();
    const split = this.settings().halfDaySplit;
    return new Map(
      DESK_BOOKING_MODES.map((m) => {
        const slot = hours ? presetSlot(m, hours, split) : null;
        return [m, slot && earliest ? notBefore(slot, earliest) : slot] as const;
      }),
    );
  });

  /** Open today, but nothing is left to book. */
  protected readonly dayOver = computed(
    () => this.hours() !== null && this.presets().get('FULL_DAY') === null,
  );

  /**
   * The picked mode. A half day that does not exist on a newly picked open day falls back to the
   * full day; on a closed day the choice is kept for when an open day is picked again.
   */
  protected readonly mode = linkedSignal<
    ReadonlyMap<DeskBookingMode, LocalSlot | null>,
    DeskBookingMode
  >({
    source: this.presets,
    computation: (presets, previous) => {
      const mode = previous?.value ?? 'FULL_DAY';
      const closed = presets.get('FULL_DAY') === null;
      return mode === 'CUSTOM' || closed || presets.get(mode) !== null ? mode : 'FULL_DAY';
    },
  });

  /**
   * Custom start choices: every step from opening time (today: from now) up to the last one before
   * closing.
   */
  protected readonly startChoices = computed(() => {
    const hours = this.hours();
    const earliest = this.earliestStart();
    if (!hours) return [];
    return timeSteps(hours.start, hours.end, this.step())
      .slice(0, -1)
      .filter((t) => !earliest || t >= earliest);
  });
  /** Kept while it is still a choice, otherwise the first one. */
  protected readonly startTime = linkedSignal<readonly string[], string>({
    source: this.startChoices,
    computation: keepOrFirst,
  });
  protected readonly endChoices = computed(() => {
    const hours = this.hours();
    const start = this.startTime();
    return hours ? timeSteps(hours.start, hours.end, this.step()).filter((t) => t > start) : [];
  });
  /** Kept while it is still a choice, otherwise the first one. */
  protected readonly endTime = linkedSignal<readonly string[], string>({
    source: this.endChoices,
    computation: keepOrFirst,
  });

  protected readonly canSubmit = computed(() => {
    if (this.saving() || !this.hours() || this.dayOver()) return false;
    if (this.date() < this.today() || this.date() > this.lastDate()) return false;
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

function sameSlot(a: LocalSlot | null, b: LocalSlot | null): boolean {
  return a === b || (a !== null && b !== null && a.start === b.start && a.end === b.end);
}

function keepOrFirst(choices: readonly string[], previous?: { value: string }): string {
  return previous && choices.includes(previous.value) ? previous.value : (choices[0] ?? '');
}
