import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PropertyChange, SelectionProperties } from '@app/spaces/data/floor-plan-editor-store';
import { GRID_SIZES } from '@app/spaces/util/plan-geometry';

type Field = PropertyChange['field'];

/** Position, size and angle of the one selected element, editable. Position is the element's center. */
@Component({
  selector: 'app-properties-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './properties-panel.html',
})
export class PropertiesPanel {
  /** Null when nothing, or more than one element, is selected. */
  readonly properties = input<SelectionProperties | null>(null);
  readonly selectionCount = input(0);
  readonly changed = output<PropertyChange>();

  /** Current zoom as a percentage, for the readout between the zoom buttons. */
  readonly zoomPercent = input(100);
  readonly snap = input(true);
  readonly gridSize = input(50);
  readonly zoomedIn = output<void>();
  readonly zoomedOut = output<void>();
  readonly fitted = output<void>();
  readonly snapToggled = output<void>();
  readonly gridSizeChosen = output<number>();

  protected readonly gridSizes = GRID_SIZES;

  protected readonly fields: readonly { readonly field: Field; readonly label: string; readonly unit: string }[] = [
    { field: 'x', label: $localize`:@@properties.x:X (center)`, unit: 'cm' },
    { field: 'y', label: $localize`:@@properties.y:Y (center)`, unit: 'cm' },
    { field: 'width', label: $localize`:@@properties.width:Width`, unit: 'cm' },
    { field: 'height', label: $localize`:@@properties.height:Height`, unit: 'cm' },
    { field: 'angle', label: $localize`:@@properties.angle:Angle`, unit: '°' },
  ];

  protected valueOf(properties: SelectionProperties, field: Field): number | null {
    return properties[field];
  }

  protected chooseGridSize(select: HTMLSelectElement): void {
    this.gridSizeChosen.emit(Number(select.value));
  }

  /** `change` fires when the admin commits the value (Enter or leaving the field), so one edit is one undo step. */
  protected commit(field: Field, input: HTMLInputElement): void {
    if (input.value.trim() === '') return;
    this.changed.emit({ field, value: Number(input.value) });
  }

  /** Puts back the stored value if the typed one was refused (empty, or not a number). */
  protected reset(input: HTMLInputElement, value: number | null): void {
    input.value = value === null ? '' : String(value);
  }
}
