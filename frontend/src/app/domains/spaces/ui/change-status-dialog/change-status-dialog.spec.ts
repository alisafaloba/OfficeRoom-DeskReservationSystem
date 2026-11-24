import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Resource, ResourceStatusInput } from '@app/spaces/models/resource';
import { ChangeStatusDialog } from './change-status-dialog';

const sampleResource: Resource = {
  id: 'r1',
  floorId: 'f1',
  name: 'Desk 101',
  type: 'DESK',
  capacity: 1,
  notes: null,
  status: 'AVAILABLE',
  bookable: true,
  equipment: [],
  createdAt: '2026-11-10T00:00:00Z',
};

describe('ChangeStatusDialog', () => {
  let fixture: ComponentFixture<ChangeStatusDialog>;
  let submitted: ResourceStatusInput[];
  let closedCalled: boolean;

  const el = () => fixture.nativeElement as HTMLElement;
  const submit = async () => {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
  });

  function create(resource: Resource = sampleResource): void {
    fixture = TestBed.createComponent(ChangeStatusDialog);
    fixture.componentRef.setInput('resource', resource);
    submitted = [];
    closedCalled = false;
    fixture.componentInstance.submitted.subscribe((v) => submitted.push(v));
    fixture.componentInstance.closed.subscribe(() => {
      closedCalled = true;
    });
    fixture.detectChanges();
  }

  it('initializes with current resource status and no reason input for AVAILABLE', () => {
    create();
    const checkedRadio = el().querySelector<HTMLInputElement>('input[type="radio"]:checked');
    expect(checkedRadio?.value).toBe('AVAILABLE');
    expect(el().querySelector('#status-reason')).toBeNull();
  });

  it('shows reason textarea when switching to MAINTENANCE', async () => {
    create();
    const maintenanceRadio = el().querySelector<HTMLInputElement>('input[value="MAINTENANCE"]')!;
    maintenanceRadio.checked = true;
    maintenanceRadio.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const textarea = el().querySelector<HTMLTextAreaElement>('#status-reason');
    expect(textarea).not.toBeNull();
  });

  it('submits updated status and reason', async () => {
    create();
    const maintenanceRadio = el().querySelector<HTMLInputElement>('input[value="MAINTENANCE"]')!;
    maintenanceRadio.checked = true;
    maintenanceRadio.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const textarea = el().querySelector<HTMLTextAreaElement>('#status-reason')!;
    textarea.value = 'Broken leg';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await submit();

    expect(submitted.length).toBe(1);
    expect(submitted[0]).toEqual({
      status: 'MAINTENANCE',
      reason: 'Broken leg',
    });
  });

  it('emits null reason when changing status to AVAILABLE', async () => {
    create({
      ...sampleResource,
      status: 'MAINTENANCE',
      statusReason: 'Broken leg',
    });

    const availableRadio = el().querySelector<HTMLInputElement>('input[value="AVAILABLE"]')!;
    availableRadio.checked = true;
    availableRadio.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    await submit();

    expect(submitted.length).toBe(1);
    expect(submitted[0]).toEqual({
      status: 'AVAILABLE',
      reason: null,
    });
  });

  it('emits closed event when cancel button is clicked', () => {
    create();
    const cancelBtn = el().querySelector<HTMLButtonElement>('button[type="button"]')!;
    cancelBtn.click();
    expect(closedCalled).toBe(true);
  });
});
