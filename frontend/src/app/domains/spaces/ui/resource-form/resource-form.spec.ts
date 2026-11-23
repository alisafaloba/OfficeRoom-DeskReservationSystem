import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Equipment, Resource, ResourceInput } from '@app/spaces/models/resource';
import { ResourceForm } from './resource-form';

const sampleEquipment: Equipment[] = [
  { id: 'eq-1', name: 'Monitor' },
  { id: 'eq-2', name: 'Docking station' },
];

const existingResource: Resource = {
  id: 'r1',
  floorId: 'f1',
  name: 'Desk 101',
  type: 'DESK',
  capacity: 1,
  notes: 'Near the window',
  status: 'AVAILABLE',
  bookable: true,
  equipment: [{ id: 'eq-1', name: 'Monitor' }],
  createdAt: '2026-11-10T00:00:00Z',
};

describe('ResourceForm', () => {
  let fixture: ComponentFixture<ResourceForm>;
  let submitted: ResourceInput[];

  const el = () => fixture.nativeElement as HTMLElement;
  const field = (id: string) => el().querySelector<HTMLInputElement>(`#${id}`)!;
  const type = (id: string, value: string) => {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
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

  function create(resource: Resource | null = null, equipment: Equipment[] = sampleEquipment): void {
    fixture = TestBed.createComponent(ResourceForm);
    fixture.componentRef.setInput('resource', resource);
    fixture.componentRef.setInput('equipmentCatalogue', equipment);
    submitted = [];
    fixture.componentInstance.submitted.subscribe((v) => submitted.push(v));
    fixture.detectChanges();
  }

  it('submits a new desk with capacity 1 automatically', async () => {
    create();
    type('resource-name', 'Desk 42');
    await submit();

    expect(submitted).toEqual([
      {
        name: 'Desk 42',
        type: 'DESK',
        capacity: 1,
        notes: null,
        equipmentIds: [],
      },
    ]);
  });

  it('requires capacity for meeting room and validates minimum 1', async () => {
    create();
    const select = el().querySelector<HTMLSelectElement>('#resource-type')!;
    select.value = 'MEETING_ROOM';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    type('resource-name', 'Boardroom A');
    type('resource-capacity', '0');
    await submit();

    expect(submitted).toEqual([]);
    expect(el().textContent).toContain('Meeting rooms require a capacity of at least 1.');

    type('resource-capacity', '8');
    await submit();

    expect(submitted[0].capacity).toBe(8);
    expect(submitted[0].type).toBe('MEETING_ROOM');
  });

  it('toggles equipment selection', async () => {
    create();
    type('resource-name', 'Desk With Setup');

    const buttons = Array.from(el().querySelectorAll<HTMLButtonElement>('button')).filter((b) =>
      ['Monitor', 'Docking station'].includes(b.textContent?.trim() ?? '')
    );

    buttons[0].click(); // Select Monitor
    fixture.detectChanges();
    await submit();

    expect(submitted[0].equipmentIds).toEqual(['eq-1']);
  });

  it('populates initial values when editing', () => {
    create(existingResource);
    expect(el().textContent).toContain('Edit resource');
    expect(field('resource-name').value).toBe('Desk 101');
  });

  it('submits a phone booth with capacity 1', async () => {
    create();
    const select = el().querySelector<HTMLSelectElement>('#resource-type')!;
    select.value = 'PHONE_BOOTH';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    type('resource-name', 'Booth 1');
    await submit();

    expect(submitted[0].type).toBe('PHONE_BOOTH');
    expect(submitted[0].capacity).toBe(1);
  });
});
