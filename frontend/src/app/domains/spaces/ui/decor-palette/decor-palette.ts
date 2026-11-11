import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DECOR_KINDS, DecorKind } from '@app/spaces/models/floor-plan';
import { Tool } from '@app/spaces/util/drawing-machine';

/** Palette of decorative elements; choosing one switches to placing it with a click. */
@Component({
  selector: 'app-decor-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './decor-palette.html',
})
export class DecorPalette {
  readonly tool = input.required<Tool>();
  readonly kind = input.required<DecorKind>();
  readonly kindChosen = output<DecorKind>();

  protected readonly kinds = DECOR_KINDS;

  protected readonly labels: Record<DecorKind, string> = {
    DOOR: $localize`:@@decorPalette.door:Door`,
    WINDOW: $localize`:@@decorPalette.window:Window`,
    STAIRS: $localize`:@@decorPalette.stairs:Stairs`,
    ELEVATOR: $localize`:@@decorPalette.elevator:Elevator`,
    PLANT: $localize`:@@decorPalette.plant:Plant`,
  };
}
