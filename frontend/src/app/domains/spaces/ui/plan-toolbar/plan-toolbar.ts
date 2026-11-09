import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Tool } from '@app/spaces/util/drawing-machine';

interface ToolButton {
  readonly tool: Tool;
  readonly label: string;
}

/** The drawing tools; the active one is pressed. */
@Component({
  selector: 'app-plan-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-toolbar.html',
})
export class PlanToolbar {
  readonly tool = input.required<Tool>();
  readonly toolChosen = output<Tool>();

  protected readonly buttons: readonly ToolButton[] = [
    { tool: 'SELECT', label: $localize`:@@planToolbar.select:Select` },
    { tool: 'WALL', label: $localize`:@@planToolbar.wall:Wall` },
    { tool: 'OUTLINE', label: $localize`:@@planToolbar.outline:Outline` },
    { tool: 'ZONE', label: $localize`:@@planToolbar.zone:Zone` },
    { tool: 'ROOM', label: $localize`:@@planToolbar.room:Room` },
    { tool: 'DESK', label: $localize`:@@planToolbar.desk:Desk` },
  ];
}
