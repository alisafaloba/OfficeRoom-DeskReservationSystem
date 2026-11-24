import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import {
  Resource,
  ResourceStatus,
  ResourceStatusInput,
  RESOURCE_STATUS_LABELS,
} from '@app/spaces/models/resource';

@Component({
  selector: 'app-change-status-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-status-dialog.html',
})
export class ChangeStatusDialog {
  readonly resource = input.required<Resource>();
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly submitted = output<ResourceStatusInput>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly statusOptions: ResourceStatus[] = ['AVAILABLE', 'MAINTENANCE', 'RESTRICTED'];
  protected readonly statusLabels = RESOURCE_STATUS_LABELS;

  protected readonly selectedStatus = linkedSignal<ResourceStatus>(() => this.resource().status);
  protected readonly reason = linkedSignal<string>(() => this.resource().statusReason ?? '');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!el.open) el.showModal();
    });
  }

  protected onStatusChange(status: ResourceStatus): void {
    this.selectedStatus.set(status);
  }

  protected save(): void {
    const status = this.selectedStatus();
    const reasonText = this.reason().trim();
    this.submitted.emit({
      status,
      reason: status === 'AVAILABLE' ? null : (reasonText || null),
    });
  }
}
