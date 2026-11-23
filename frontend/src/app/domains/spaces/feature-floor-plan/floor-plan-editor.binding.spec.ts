import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideTestBackend } from '@app-testing/test-backend';
import { PlanElement } from '@app/spaces/models/floor-plan';
import { Resource, ResourceType } from '@app/spaces/models/resource';
import { FloorPlanEditor } from './floor-plan-editor';

const resource = (id: string, type: ResourceType, name: string): Resource => ({
  id,
  floorId: 'f1',
  name,
  type,
  capacity: type === 'MEETING_ROOM' ? 6 : 1,
  notes: null,
  status: 'BOOKABLE',
  bookable: true,
  equipment: [],
  createdAt: '2026-11-23T10:00:00Z',
});

const deskAt = (id: string, x: number, resourceId?: string): PlanElement => ({
  id,
  type: 'DESK',
  position: { x, y: 200 },
  width: 140,
  height: 70,
  rotation: 0,
  ...(resourceId ? { resourceId } : {}),
});

/** The editor opened on a real floor: loading, binding shapes to resources, creating them and saving. */
describe('FloorPlanEditor with resources', () => {
  let fixture: ComponentFixture<FloorPlanEditor>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function open(elements: PlanElement[], resources: Resource[], version: number | null = 3) {
    TestBed.configureTestingModule({ providers: provideTestBackend() });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FloorPlanEditor);
    fixture.componentRef.setInput('floorId', 'f1');
    fixture.detectChanges();
    root = fixture.nativeElement;
    http.expectOne('/api/v1/floors/f1/resources').flush(resources);
    http.expectOne('/api/v1/floors/f1/plan').flush({ floorId: 'f1', version, schemaVersion: 1, elements, updatedAt: null, updatedBy: null });
    await settle();
    // Plan units = screen pixels, so tests can click on shapes where they were stored.
    const zoomIn = root.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!;
    for (let i = 0; i < 6; i++) zoomIn.click();
    button('Fit to screen');
    await settle();
  }

  afterEach(() => http.verify());

  const button = (text: string) => {
    const found = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
    if (!found) throw new Error(`no button "${text}"`);
    found.click();
    fixture.detectChanges();
  };

  /** Selects an element by clicking the center of its shape on the canvas. */
  function clickElement(type: string, index = 0) {
    const shape = root.querySelectorAll<SVGGraphicsElement>(`[data-element="${type}"]`)[index];
    const box = shape.getBoundingClientRect();
    const svg = root.querySelector('svg')!;
    const init = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, bubbles: true, button: 0, pointerId: 1 };
    svg.dispatchEvent(new PointerEvent('pointerdown', init));
    svg.dispatchEvent(new PointerEvent('pointerup', init));
    fixture.detectChanges();
  }

  const unplaced = () => Array.from(root.querySelectorAll('[data-resource-id]')).map((li) => li.getAttribute('data-resource-id'));
  const unboundMarkers = () => root.querySelectorAll('[data-unbound]').length;

  it('marks unbound shapes and lists resources that are not on the plan', async () => {
    await open([deskAt('a', 100, 'd1'), deskAt('b', 400)], [resource('d1', 'DESK', 'Desk 1'), resource('d2', 'DESK', 'Desk 2')]);

    expect(unboundMarkers()).toBe(1);
    expect(unplaced()).toEqual(['d2']);
    expect(root.textContent).toContain('Desk 1');
    expect(root.querySelector('[data-testid="unbound-count"]')?.textContent).toContain('1 not linked');
  });

  it('shows Resource: none for an unbound desk and binds it to the picked resource', async () => {
    await open([deskAt('a', 100)], [resource('d1', 'DESK', 'Desk 1'), resource('d2', 'DESK', 'Desk 2'), resource('m1', 'MEETING_ROOM', 'Atlas')]);

    clickElement('DESK');
    expect(root.querySelector('[data-testid="unbound-notice"]')?.textContent).toContain('Resource: none');
    const select = root.querySelector<HTMLSelectElement>('#binding-select')!;
    // Only desks are offered for a desk.
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['Choose…', 'Desk 1', 'Desk 2']);

    select.value = 'd2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="bound-resource"]')?.textContent).toBe('Desk 2');
    expect(unboundMarkers()).toBe(0);
    expect(unplaced()).toEqual(['d1', 'm1']);
    expect(root.querySelector('[data-label-for="DESK"]')?.textContent).toContain('Desk 2');
  });

  it('shows the resource name, not the stored label, so a renamed resource shows renamed', async () => {
    const room: PlanElement = {
      id: 'r',
      type: 'ROOM',
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 200 },
        { x: 0, y: 200 },
      ],
      label: 'Old name',
      resourceId: 'm1',
    };
    await open([room], [resource('m1', 'MEETING_ROOM', 'Atlas (renamed)')]);

    expect(root.querySelector('[data-element="ROOM"] title')?.textContent).toBe('Atlas (renamed)');
    expect(root.querySelector('[data-label-for="ROOM"]')?.textContent).toContain('Atlas');
    expect(root.textContent).not.toContain('Old name');
  });

  it('creates a resource from an unbound shape and binds it', async () => {
    await open([deskAt('a', 100)], []);
    clickElement('DESK');
    expect(root.textContent).toContain('No free desk on this floor.');

    button('Create resource');
    root.querySelector<HTMLInputElement>('#new-resource-name')!.value = 'Desk 42';
    button('Create');

    const request = http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/floors/f1/resources');
    expect(request.request.body).toMatchObject({ name: 'Desk 42', type: 'DESK', capacity: 1 });
    request.flush(resource('new', 'DESK', 'Desk 42'));
    await settle();

    expect(root.querySelector('[data-testid="bound-resource"]')?.textContent).toBe('Desk 42');
  });

  it('asks for a capacity when creating a meeting room', async () => {
    const room: PlanElement = { id: 'r', type: 'ROOM', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }], label: 'R' };
    await open([room], []);
    clickElement('ROOM');

    button('Create resource');
    root.querySelector<HTMLInputElement>('#new-resource-name')!.value = 'Atlas';
    root.querySelector<HTMLInputElement>('#new-resource-capacity')!.value = '8';
    button('Create');

    const request = http.expectOne((r) => r.method === 'POST');
    expect(request.request.body).toMatchObject({ name: 'Atlas', type: 'MEETING_ROOM', capacity: 8 });
    request.flush({ message: 'taken' }, { status: 409, statusText: 'Conflict' });
    await settle();

    expect(root.textContent).toContain('already has a resource with this label');
  });

  it('places an unplaced resource with its Place button', async () => {
    await open([], [resource('m1', 'MEETING_ROOM', 'Atlas')]);

    button('Place');

    expect(root.querySelectorAll('[data-element="ROOM"]').length).toBe(1);
    expect(unplaced()).toEqual([]);
    expect(root.querySelector('[data-testid="bound-resource"]')?.textContent).toBe('Atlas');
  });

  it('places a resource dropped on the canvas', async () => {
    await open([], [resource('d1', 'DESK', 'Desk 1')]);
    const frame = root.querySelector('svg')!.parentElement!;
    const data = new DataTransfer();
    data.setData('application/x-office-resource', 'd1');
    const box = frame.getBoundingClientRect();

    frame.dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: box.left + 50, clientY: box.top + 50, bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(root.querySelectorAll('[data-element="DESK"]').length).toBe(1);
    expect(unplaced()).toEqual([]);
  });

  it('puts the resource of a deleted shape back in the unplaced list', async () => {
    await open([deskAt('a', 100, 'd1')], [resource('d1', 'DESK', 'Desk 1')]);
    expect(unplaced()).toEqual([]);

    clickElement('DESK');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    fixture.detectChanges();

    expect(unplaced()).toEqual(['d1']);
  });

  it('saves the bindings with the loaded version and warns about unbound shapes', async () => {
    await open([deskAt('a', 100, 'd1'), deskAt('b', 400)], [resource('d1', 'DESK', 'Desk 1')], 3);

    button('Save');

    const request = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/floors/f1/plan');
    expect(request.request.body.version).toBe(3);
    expect(request.request.body.elements.map((e: { resourceId?: string }) => e.resourceId)).toEqual(['d1', undefined]);
    request.flush({ floorId: 'f1', version: 4, schemaVersion: 1, elements: request.request.body.elements, updatedAt: null, updatedBy: null });
    await settle();

    expect(root.querySelector('[data-testid="save-status"]')?.textContent).toContain('1 desk or room is not linked');
  });

  it('offers a reload when someone else saved in the meantime', async () => {
    await open([], [], 3);

    button('Save');
    http.expectOne((r) => r.method === 'PUT').flush({ code: 'FLOOR_PLAN_OUTDATED' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(root.querySelector('[data-testid="save-status"]')?.textContent).toContain('Someone else saved');

    button('Reload');
    http.expectOne('/api/v1/floors/f1/resources').flush([]);
    http.expectOne('/api/v1/floors/f1/plan').flush({ floorId: 'f1', version: 5, schemaVersion: 1, elements: [], updatedAt: null, updatedBy: null });
    await settle();
    expect(root.querySelector('[data-testid="save-status"]')).toBeNull();
  });

  it('saves with Ctrl+S', async () => {
    await open([], [], null);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));

    const request = http.expectOne((r) => r.method === 'PUT');
    expect(request.request.body.version).toBeNull();
    request.flush({ floorId: 'f1', version: 0, schemaVersion: 1, elements: [], updatedAt: null, updatedBy: null });
    await settle();
  });
});
