import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Building, BuildingInput, WEEKDAYS } from '@app/spaces/models/building';
import { BuildingForm } from './building-form';

const existing: Building = {
  id: 'b1',
  name: 'HQ',
  address: '1 Main Street',
  timeZone: 'Europe/Bucharest',
  openingHours: WEEKDAYS.map((dayOfWeek) =>
    dayOfWeek === 'SUNDAY'
      ? { dayOfWeek, opensAt: null, closesAt: null }
      : { dayOfWeek, opensAt: '09:00:00', closesAt: '17:30:00' },
  ),
  floorCount: 2,
  createdAt: '2026-11-02T00:00:00Z',
};

describe('BuildingForm', () => {
  let fixture: ComponentFixture<BuildingForm>;
  let submitted: BuildingInput[];

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
  const timeInputs = () => Array.from(el().querySelectorAll<HTMLInputElement>('input[type="time"]'));

  beforeAll(() => {
    // jsdom has no modal <dialog>; the browser provides it in production.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
  });

  function create(building: Building | null): void {
    fixture = TestBed.createComponent(BuildingForm);
    fixture.componentRef.setInput('building', building);
    submitted = [];
    fixture.componentInstance.submitted.subscribe((v) => submitted.push(v));
    fixture.detectChanges();
  }

  it('starts a new building open Monday to Friday and closed on the weekend', async () => {
    create(null);
    type('building-name', '  Annex ');
    type('building-address', '2 Side Street');
    type('building-time-zone', 'Europe/Berlin');
    await submit();

    expect(submitted).toHaveLength(1);
    const [value] = submitted;
    expect(value.name).toBe('Annex');
    expect(value.timeZone).toBe('Europe/Berlin');
    expect(value.openingHours[0]).toEqual({ dayOfWeek: 'MONDAY', opensAt: '08:00', closesAt: '18:00' });
    expect(value.openingHours[5]).toEqual({ dayOfWeek: 'SATURDAY', opensAt: null, closesAt: null });
    expect(value.openingHours).toHaveLength(7);
  });

  it('does not submit without a name or a time zone', async () => {
    create(null);
    type('building-address', '2 Side Street');
    await submit();

    expect(submitted).toEqual([]);
    expect(el().textContent).toContain('Pick a time zone from the list.');
  });

  it('offers UTC and keeps the building\'s own zone even when the browser list lacks it', () => {
    create({ ...existing, timeZone: 'Europe/Kyiv' });
    const options = Array.from(el().querySelectorAll('datalist option'), (o) => (o as HTMLOptionElement).value);

    expect(options).toContain('UTC');
    expect(options).toContain('Europe/Kyiv');
  });

  it('submits an edit of a building whose zone the browser does not list', async () => {
    create({ ...existing, timeZone: 'Etc/UTC' });
    type('building-address', '9 New Street');
    await submit();

    expect(submitted).toHaveLength(1);
    expect(submitted[0].timeZone).toBe('Etc/UTC');
  });

  it('prefills an existing building, trimming stored times to HH:mm', () => {
    create(existing);

    expect(field('building-name').value).toBe('HQ');
    expect(field('building-time-zone').value).toBe('Europe/Bucharest');
    expect(timeInputs()[0].value).toBe('09:00');
    expect(timeInputs()[1].value).toBe('17:30');
    // Sunday is closed: six open days render two time boxes each.
    expect(timeInputs()).toHaveLength(12);
  });

  it('blocks a closing time that is not after the opening time', async () => {
    create(existing);
    const monday = timeInputs()[1];
    monday.value = '08:00';
    monday.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await submit();

    expect(submitted).toEqual([]);
    expect(el().textContent).toContain('Closing time must be after opening time.');
  });

  it('sends null times for a day marked closed', async () => {
    create(existing);
    const closedBoxes = el().querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    closedBoxes[0].checked = true;
    closedBoxes[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await submit();

    expect(submitted[0].openingHours[0]).toEqual({ dayOfWeek: 'MONDAY', opensAt: null, closesAt: null });
    expect(submitted[0].openingHours[1].opensAt).toBe('09:00');
  });
});
