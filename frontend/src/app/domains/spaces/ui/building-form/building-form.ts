import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  required,
  schema,
  submit,
} from '@angular/forms/signals';
import { Building, BuildingInput, OpeningHours, Weekday, WEEKDAYS } from '@app/spaces/models/building';

interface BuildingFormModel {
  name: string;
  address: string;
  timeZone: string;
}

/** One weekday row as the inputs see it: `HH:mm` strings, empty while the day is closed. */
interface DayRow {
  readonly dayOfWeek: Weekday;
  readonly closed: boolean;
  readonly opensAt: string;
  readonly closesAt: string;
}

const DEFAULT_OPENS = '08:00';
const DEFAULT_CLOSES = '18:00';

/**
 * The browser's IANA list, for suggestions only. It differs from the backend's (no `UTC`, older
 * names like `Asia/Calcutta`), so the backend stays the judge of what is valid.
 */
const BROWSER_TIME_ZONES: readonly string[] = Intl.supportedValuesOf('timeZone');

const toRow = (day: Weekday, hours: OpeningHours | undefined): DayRow =>
  hours?.opensAt && hours.closesAt
    ? { dayOfWeek: day, closed: false, opensAt: hours.opensAt.slice(0, 5), closesAt: hours.closesAt.slice(0, 5) }
    : { dayOfWeek: day, closed: hours !== undefined, opensAt: '', closesAt: '' };

/** Modal dialog to create (`building` is null) or edit a building. Emits the input; the parent saves. */
@Component({
  selector: 'app-building-form',
  imports: [FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './building-form.html',
})
export class BuildingForm {
  readonly building = input<Building | null>(null);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly submitted = output<BuildingInput>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  private readonly weekdayNames = new Intl.DateTimeFormat(inject(LOCALE_ID), { weekday: 'long' });

  /** Browser suggestions plus `UTC` and the building's own zone, so an existing building always shows its value. */
  protected readonly timeZones = computed(() => {
    const extra = [this.building()?.timeZone, 'UTC'].filter((zone): zone is string => !!zone);
    return [...new Set([...extra, ...BROWSER_TIME_ZONES])].sort();
  });
  protected readonly isCreate = computed(() => this.building() === null);

  protected readonly model = linkedSignal<BuildingFormModel>(() => ({
    name: this.building()?.name ?? '',
    address: this.building()?.address ?? '',
    timeZone: this.building()?.timeZone ?? '',
  }));

  /**
   * A new building starts Monday–Friday 08:00–18:00 and closed on the weekend, so the common
   * case needs no typing; editing starts from what is stored.
   */
  protected readonly days = linkedSignal<DayRow[]>(() => {
    const existing = this.building()?.openingHours;
    return WEEKDAYS.map((day, index) => {
      if (existing) return toRow(day, existing.find((h) => h.dayOfWeek === day));
      return index < 5
        ? { dayOfWeek: day, closed: false, opensAt: DEFAULT_OPENS, closesAt: DEFAULT_CLOSES }
        : { dayOfWeek: day, closed: true, opensAt: '', closesAt: '' };
    });
  });

  /** Set once a save was attempted, so untouched hour rows do not show errors up front. */
  private readonly hoursChecked = signal(false);

  /** Per weekday: why its times are unusable, or null. Closed days are always fine. */
  protected readonly dayErrors = computed<(string | null)[]>(() =>
    this.days().map((d) => {
      if (d.closed) return null;
      if (!d.opensAt || !d.closesAt) {
        return $localize`:@@buildingForm.timesRequired:Enter an opening and a closing time.`;
      }
      return d.closesAt > d.opensAt
        ? null
        : $localize`:@@buildingForm.closeBeforeOpen:Closing time must be after opening time.`;
    }),
  );
  protected readonly showDayErrors = this.hoursChecked.asReadonly();

  protected readonly form = form(
    this.model,
    schema<BuildingFormModel>((path) => {
      required(path.name);
      maxLength(path.name, 120);
      required(path.address);
      maxLength(path.address, 300);
      required(path.timeZone);
      // Whether the zone exists is the backend's call (400 with errors.timeZone).
    }),
  );

  constructor() {
    // Native modal: focus trap, Escape and backdrop come from the browser.
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!el.open) el.showModal();
    });
  }

  /** 2024-01-01 was a Monday, so the 1-based index of the weekday is its day of the month. */
  protected weekdayName(day: Weekday): string {
    return this.weekdayNames.format(new Date(2024, 0, WEEKDAYS.indexOf(day) + 1));
  }

  protected opensLabel(day: Weekday): string {
    return $localize`:@@buildingForm.opensOn:${this.weekdayName(day)}:day: opens`;
  }

  protected closesLabel(day: Weekday): string {
    return $localize`:@@buildingForm.closesOn:${this.weekdayName(day)}:day: closes`;
  }

  protected setClosed(day: Weekday, closed: boolean): void {
    this.patchDay(day, (d) => ({
      ...d,
      closed,
      // Re-opening a day offers the usual hours instead of two empty boxes.
      opensAt: closed ? '' : d.opensAt || DEFAULT_OPENS,
      closesAt: closed ? '' : d.closesAt || DEFAULT_CLOSES,
    }));
  }

  protected setTime(day: Weekday, field: 'opensAt' | 'closesAt', value: string): void {
    this.patchDay(day, (d) => ({ ...d, [field]: value }));
  }

  private patchDay(day: Weekday, change: (d: DayRow) => DayRow): void {
    this.days.update((rows) => rows.map((d) => (d.dayOfWeek === day ? change(d) : d)));
  }

  protected async save(): Promise<void> {
    this.hoursChecked.set(true);
    const hoursValid = this.dayErrors().every((e) => e === null);
    await submit(this.form, async () => {
      if (!hoursValid) return;
      const { name, address, timeZone } = this.model();
      this.submitted.emit({
        name: name.trim(),
        address: address.trim(),
        timeZone,
        openingHours: this.days().map((d) => ({
          dayOfWeek: d.dayOfWeek,
          opensAt: d.closed ? null : d.opensAt,
          closesAt: d.closed ? null : d.closesAt,
        })),
      });
    });
  }
}
