import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PlanElement, PlanElementType } from '@app/spaces/models/floor-plan';
import { GRID_SIZES } from '@app/spaces/util/plan-geometry';

interface Detail {
  readonly name: string;
  readonly value: string;
}

/** Side panel: what is selected, the view (zoom) and the grid. It holds no state of its own. */
@Component({
  selector: 'app-properties-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './properties-panel.html',
})
export class PropertiesPanel {
  readonly element = input<PlanElement | null>(null);
  readonly zoomPercent = input.required<number>();
  readonly snap = input.required<boolean>();
  readonly gridSize = input.required<number>();

  readonly deleted = output<void>();
  readonly zoomedIn = output<void>();
  readonly zoomedOut = output<void>();
  readonly fitted = output<void>();
  readonly snapToggled = output<void>();
  readonly gridSizeChosen = output<number>();

  protected readonly gridSizes = GRID_SIZES;

  private readonly typeLabels: Record<PlanElementType, string> = {
    WALL: $localize`:@@planToolbar.wall:Wall`,
    OUTLINE: $localize`:@@planToolbar.outline:Outline`,
    ZONE: $localize`:@@planToolbar.zone:Zone`,
    ROOM: $localize`:@@planToolbar.room:Room`,
    DESK: $localize`:@@planToolbar.desk:Desk`,
    DECOR: $localize`:@@decorPalette.title:Decor`,
  };

  private readonly names = {
    label: $localize`:@@properties.label:Label`,
    position: $localize`:@@properties.position:Position`,
    size: $localize`:@@properties.size:Size`,
    points: $localize`:@@properties.points:Points`,
  };

  protected readonly typeLabel = computed(() => {
    const element = this.element();
    return element ? this.typeLabels[element.type] : '';
  });

  protected readonly details = computed<readonly Detail[]>(() => {
    const element = this.element();
    if (!element) return [];
    switch (element.type) {
      case 'DESK':
      case 'DECOR':
        return [
          { name: this.names.position, value: `${Math.round(element.position.x)}, ${Math.round(element.position.y)} cm` },
          { name: this.names.size, value: `${element.width} × ${element.height} cm` },
        ];
      case 'ROOM':
      case 'ZONE':
        return [
          ...(element.label ? [{ name: this.names.label, value: element.label }] : []),
          { name: this.names.points, value: String(element.points.length) },
        ];
      default:
        return [{ name: this.names.points, value: String(element.points.length) }];
    }
  });

  protected chooseSize(event: Event): void {
    this.gridSizeChosen.emit(Number((event.target as HTMLSelectElement).value));
  }
}
