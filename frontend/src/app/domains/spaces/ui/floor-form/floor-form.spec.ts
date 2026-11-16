import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Floor, FloorInput } from '@app/spaces/models/floor';
import { FloorForm } from './floor-form';

const existing: Floor = {
  id: 'f1',
  buildingId: 'b1',
  name: 'First floor',
  number: 1,
  sortOrder: 0,
  createdAt: '2026-11-10T00:00:00Z',
};

describe('FloorForm', () => {
  let fixture: ComponentFixture<FloorForm>;
  let submitted: FloorInput[];

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
    // jsdom has no modal <dialog>; the browser provides it in production.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
  });

  function create(floor: Floor | null, suggestedNumber = 0): void {
    fixture = TestBed.createComponent(FloorForm);
    fixture.componentRef.setInput('floor', floor);
    fixture.componentRef.setInput('suggestedNumber', suggestedNumber);
    submitted = [];
    fixture.componentInstance.submitted.subscribe((v) => submitted.push(v));
    fixture.detectChanges();
  }

  it('prefills a new floor with the suggested number and submits a trimmed name', async () => {
    create(null, 3);
    expect(field('floor-number').value).toBe('3');

    type('floor-name', '  Third floor ');
    await submit();

    expect(submitted).toEqual([{ name: 'Third floor', number: 3 }]);
  });

  it('accepts a negative number for a basement', async () => {
    create(null);
    type('floor-name', 'Basement');
    type('floor-number', '-1');
    await submit();

    expect(submitted).toEqual([{ name: 'Basement', number: -1 }]);
  });

  it('starts from the stored values when editing', async () => {
    create(existing);
    expect(el().textContent).toContain('Edit floor');
    expect(field('floor-name').value).toBe('First floor');

    type('floor-number', '2');
    await submit();

    expect(submitted).toEqual([{ name: 'First floor', number: 2 }]);
  });

  it('does not submit without a name or a number', async () => {
    create(null);
    type('floor-number', '');
    await submit();

    expect(submitted).toEqual([]);
    expect(el().textContent).toContain('Enter a name');
    expect(el().textContent).toContain('Enter a whole number from -50 to 500.');
  });

  it('does not submit a number out of range or with decimals', async () => {
    for (const value of ['501', '-51', '1.5']) {
      create(null);
      type('floor-name', 'Somewhere');
      type('floor-number', value);
      await submit();

      expect(submitted, value).toEqual([]);
    }
  });

  it('shows the server error passed in', () => {
    create(null);
    fixture.componentRef.setInput('error', 'This building already has a floor with this number.');
    fixture.detectChanges();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('already has a floor');
  });
});
