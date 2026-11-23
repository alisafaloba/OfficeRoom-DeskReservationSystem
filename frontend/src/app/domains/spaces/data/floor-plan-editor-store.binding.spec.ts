import { TestBed } from '@angular/core/testing';
import { DeskElement, PlanElement } from '@app/spaces/models/floor-plan';
import { Resource, ResourceType } from '@app/spaces/models/resource';
import { FloorPlanEditorStore } from './floor-plan-editor-store';

const resource = (id: string, type: ResourceType, name = id): Resource => ({
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

const desk = (id: string, x: number, resourceId?: string): DeskElement => ({
  id,
  type: 'DESK',
  position: { x, y: 100 },
  width: 140,
  height: 70,
  rotation: 0,
  ...(resourceId ? { resourceId } : {}),
});

/** Binding shapes to resources (E3.T4) in the editor state. */
describe('FloorPlanEditorStore resource binding', () => {
  let store: FloorPlanEditorStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FloorPlanEditorStore] });
    store = TestBed.inject(FloorPlanEditorStore);
    store.setResources([resource('d1', 'DESK', 'Desk 1'), resource('d2', 'DESK', 'Desk 2'), resource('m1', 'MEETING_ROOM', 'Atlas')]);
    // Identity viewport: screen pixels are plan units.
    store.zoomAt({ x: 0, y: 0 }, 4);
    store.panBy(-store.viewport().panX, -store.viewport().panY);
    store.toggleSnap();
  });

  const select = (id: string) => {
    const element = store.elements().find((e) => e.id === id)!;
    const at = 'position' in element ? element.position : element.points[0];
    store.pointerDown(at);
    store.pointerUp(at);
  };

  const resourceOf = (id: string) => {
    const element = store.elements().find((e) => e.id === id) as PlanElement & { resourceId?: string };
    return element?.resourceId;
  };

  it('opens a plan as saved and drops bindings to resources that are gone', () => {
    store.loadPlan([desk('a', 100, 'd1'), desk('b', 400, 'deleted')]);

    expect(resourceOf('a')).toBe('d1');
    expect(resourceOf('b')).toBeUndefined();
    expect(store.dirty()).toBe(false);
    expect(store.canUndo()).toBe(false);
  });

  it('shows an unbound desk with the free desks to pick from', () => {
    store.loadPlan([desk('a', 100, 'd1'), desk('b', 400)]);
    select('b');

    const binding = store.binding()!;
    expect(binding.resource).toBeNull();
    expect(binding.resourceType).toBe('DESK');
    expect(binding.candidates.map((r) => r.id)).toEqual(['d2']);
  });

  it('binds the selected desk as one undo step, and the resource leaves the unplaced list', () => {
    store.loadPlan([desk('a', 100)]);
    select('a');
    expect(store.unplacedResources().map((r) => r.id)).toEqual(['d1', 'd2', 'm1']);

    expect(store.bindSelected('d2')).toBe(true);

    expect(resourceOf('a')).toBe('d2');
    expect(store.binding()!.resource!.name).toBe('Desk 2');
    expect(store.unplacedResources().map((r) => r.id)).toEqual(['d1', 'm1']);
    expect(store.dirty()).toBe(true);
    store.undo();
    expect(resourceOf('a')).toBeUndefined();
  });

  it('refuses a resource that is bound elsewhere or of another type', () => {
    store.loadPlan([desk('a', 100, 'd1'), desk('b', 400)]);
    select('b');

    expect(store.bindSelected('d1')).toBe(false);
    expect(store.bindSelected('m1')).toBe(false);
    expect(store.bindSelected('unknown')).toBe(false);
    expect(resourceOf('b')).toBeUndefined();
  });

  it('unbinds with null', () => {
    store.loadPlan([desk('a', 100, 'd1')]);
    select('a');

    store.bindSelected(null);

    expect(resourceOf('a')).toBeUndefined();
    expect(store.unboundShapes().map((e) => e.id)).toEqual(['a']);
  });

  it('puts the resource of a deleted shape back in the unplaced list, without deleting it', () => {
    store.loadPlan([desk('a', 100, 'd1')]);
    select('a');

    store.deleteSelection();

    expect(store.unplacedResources().map((r) => r.id)).toContain('d1');
    expect(store.resources().map((r) => r.id)).toContain('d1');
  });

  it('drops an unplaced resource on the plan as a bound, selected shape', () => {
    store.loadPlan([]);

    expect(store.placeResource('m1', { x: 500, y: 300 })).toBe(true);

    const [room] = store.elements();
    expect(room.type).toBe('ROOM');
    expect(resourceOf(room.id)).toBe('m1');
    expect([...store.selectedIds()]).toEqual([room.id]);
    expect(store.tool()).toBe('SELECT');
    expect(store.placeResource('m1', { x: 0, y: 0 })).toBe(false);
  });

  it('does not copy a binding when pasting', () => {
    store.loadPlan([desk('a', 100, 'd1')]);
    select('a');
    store.copySelection();

    store.paste();

    const copy = store.elements().find((e) => e.id !== 'a')!;
    expect(resourceOf(copy.id)).toBeUndefined();
  });

  it('knows a resource created in the editor and can bind it', () => {
    store.loadPlan([desk('a', 100)]);
    select('a');

    store.addResource(resource('d9', 'DESK', 'Desk 9'));

    expect(store.bindSelected('d9')).toBe(true);
    expect(store.resourceNames().get('d9')).toBe('Desk 9');
  });

  it('is clean again once saved', () => {
    store.loadPlan([desk('a', 100)]);
    select('a');
    store.bindSelected('d1');

    store.markSaved(store.elements());

    expect(store.dirty()).toBe(false);
  });
});
