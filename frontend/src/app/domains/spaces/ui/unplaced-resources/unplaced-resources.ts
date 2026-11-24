import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Resource } from '@app/spaces/models/resource';
import { RESOURCE_TYPE_NAMES } from '@app/spaces/ui/resource-type-names';

/** The drag payload type for a resource dropped on the canvas. */
export const RESOURCE_DRAG_TYPE = 'application/x-office-resource';

/**
 * Resources of the floor that have no shape on the plan yet. Drag one onto the canvas to place it,
 * or use its Place button (keyboard) to put it in the middle of the view.
 */
@Component({
  selector: 'app-unplaced-resources',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unplaced-resources.html',
})
export class UnplacedResources {
  readonly resources = input.required<readonly Resource[]>();
  /** A resource id, placed with the keyboard rather than by dragging. */
  readonly placed = output<string>();

  protected readonly typeNames = RESOURCE_TYPE_NAMES;

  protected dragStart(event: DragEvent, resource: Resource): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(RESOURCE_DRAG_TYPE, resource.id);
    event.dataTransfer.setData('text/plain', resource.name);
    event.dataTransfer.effectAllowed = 'copy';
  }
}
