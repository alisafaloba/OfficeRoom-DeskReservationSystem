import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTestBackend } from '@app-testing/test-backend';
import { Building, WEEKDAYS } from '@app/spaces/models/building';
import { Floor } from '@app/spaces/models/floor';
import { FloorManagement } from './floor-management';

const BUILDING_ID = 'b1';
const FLOORS_URL = `/api/v1/buildings/${BUILDING_ID}/floors`;

const building: Building = {
  id: BUILDING_ID,
  name: 'HQ',
  address: '1 Main Street',
  timeZone: 'Europe/Bucharest',
  openingHours: WEEKDAYS.map((dayOfWeek) => ({ dayOfWeek, opensAt: null, closesAt: null })),
  floorCount: 3,
  createdAt: '2026-11-02T00:00:00Z',
};

const floor = (n: number, name: string, sortOrder: number): Floor => ({
  id: `f${n}`,
  buildingId: BUILDING_ID,
  name,
  number: n,
  sortOrder,
  createdAt: '2026-11-10T00:00:00Z',
});

const FLOORS = [floor(0, 'Ground floor', 0), floor(1, 'First floor', 1), floor(2, 'Second floor', 2)];

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('FloorManagement', () => {
  let fixture: ComponentFixture<FloorManagement>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(el().querySelectorAll<HTMLElement>('[data-testid="floor-row"]'));
  const rowNames = () => rows().map((r) => r.querySelector('.flex-1')?.textContent?.trim());
  const button = (row: HTMLElement, label: string) =>
    Array.from(row.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
    )!;

  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
  });

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...provideTestBackend(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FloorManagement);
    fixture.componentRef.setInput('buildingId', BUILDING_ID);
    fixture.detectChanges();
    http.expectOne(`/api/v1/buildings/${BUILDING_ID}`).flush(building);
    http.expectOne((r) => r.url === FLOORS_URL && r.method === 'GET').flush(FLOORS);
    await render();
  });

  afterEach(() => http.verify());

  it('shows the building name and its floors in display order', () => {
    expect(el().querySelector('h1')?.textContent).toContain('HQ');
    expect(rowNames()).toEqual(['Ground floor', 'First floor', 'Second floor']);
    expect(rows()[1].textContent).toContain('No. 1');
    expect(rows()[0].querySelector('a')?.getAttribute('href')).toBe('/floor-plans/f0');
  });

  it('reorders by drag and drop and saves the new order', async () => {
    const [ground, , second] = rows();
    const data = new DataTransfer();
    second.dispatchEvent(new DragEvent('dragstart', { dataTransfer: data }));
    ground.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, cancelable: true }));
    ground.dispatchEvent(new DragEvent('drop', { dataTransfer: data, cancelable: true }));
    await render();

    expect(rowNames()).toEqual(['Second floor', 'Ground floor', 'First floor']);
    const req = http.expectOne((r) => r.url === `${FLOORS_URL}/order`);
    expect(req.request.body).toEqual({ floorIds: ['f2', 'f0', 'f1'] });
    req.flush([floor(2, 'Second floor', 0), floor(0, 'Ground floor', 1), floor(1, 'First floor', 2)]);
    await render();

    expect(rowNames()).toEqual(['Second floor', 'Ground floor', 'First floor']);
  });

  it('moves a floor with the arrow buttons, the keyboard alternative to dragging', async () => {
    expect(button(rows()[0], 'Move Ground floor up').disabled).toBe(true);
    expect(button(rows()[2], 'Move Second floor down').disabled).toBe(true);

    button(rows()[0], 'Move Ground floor down').click();
    await render();

    const req = http.expectOne((r) => r.url === `${FLOORS_URL}/order`);
    expect(req.request.body).toEqual({ floorIds: ['f1', 'f0', 'f2'] });
    req.flush([floor(1, 'First floor', 0), floor(0, 'Ground floor', 1), floor(2, 'Second floor', 2)]);
    await render();
    expect(rowNames()).toEqual(['First floor', 'Ground floor', 'Second floor']);
  });

  it('suggests the next floor number when adding a floor', async () => {
    el().querySelector<HTMLButtonElement>('header + div button')!.click();
    await render();

    expect(el().querySelector<HTMLInputElement>('#floor-number')?.value).toBe('3');
  });

  it('deletes a floor after confirmation and closes the dialog', async () => {
    button(rows()[1], 'Delete').click();
    await render();
    const dialog = el().querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('First floor');
    expect(dialog.textContent).toContain('resources and floor plan');

    Array.from(dialog.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Delete')!
      .click();
    http.expectOne((r) => r.url === `${FLOORS_URL}/f1` && r.method === 'DELETE').flush(null);
    await tick();
    http.expectOne((r) => r.url === FLOORS_URL && r.method === 'GET').flush([FLOORS[0], FLOORS[2]]);
    await tick();
    await render();

    expect(el().querySelector('app-confirm-dialog')).toBeNull();
    expect(rowNames()).toEqual(['Ground floor', 'Second floor']);
  });

  it('keeps the delete dialog open with the error when deletion fails', async () => {
    button(rows()[0], 'Delete').click();
    await render();
    const dialog = el().querySelector('app-confirm-dialog')!;
    Array.from(dialog.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Delete')!
      .click();
    http
      .expectOne((r) => r.method === 'DELETE')
      .flush({ code: 'FLOOR_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await render();

    expect(el().querySelector('app-confirm-dialog')?.textContent).toContain('This floor no longer exists.');
  });
});
