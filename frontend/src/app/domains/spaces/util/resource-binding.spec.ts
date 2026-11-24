import { DeskElement, PlanElement, RoomElement } from '@app/spaces/models/floor-plan';
import { Resource, ResourceType } from '@app/spaces/models/resource';
import {
  bindingCandidates,
  boundResourceIds,
  shapeForResource,
  unboundShapes,
  unplacedResources,
  withBinding,
  withoutStaleBindings,
} from './resource-binding';

const resource = (id: string, type: ResourceType, name = id): Resource => ({
  id,
  floorId: 'f1',
  name,
  type,
  capacity: 1,
  notes: null,
  status: 'AVAILABLE',
  bookable: type !== 'BREAK_ROOM',
  equipment: [],
  createdAt: '2026-11-23T10:00:00Z',
});

const desk = (id: string, resourceId?: string): DeskElement => ({
  id,
  type: 'DESK',
  position: { x: 0, y: 0 },
  width: 140,
  height: 70,
  rotation: 0,
  ...(resourceId ? { resourceId } : {}),
});

const room = (id: string, resourceId?: string): RoomElement => ({
  id,
  type: 'ROOM',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ],
  label: 'Typed',
  ...(resourceId ? { resourceId } : {}),
});

const wall: PlanElement = { id: 'w', type: 'WALL', points: [], thickness: 20 };

describe('resource binding', () => {
  const resources = [resource('d1', 'DESK'), resource('d2', 'DESK'), resource('m1', 'MEETING_ROOM'), resource('b1', 'BREAK_ROOM')];

  it('lists the resources no shape is bound to', () => {
    const elements = [desk('a', 'd1'), room('r', 'm1'), wall];

    expect([...boundResourceIds(elements)]).toEqual(['d1', 'm1']);
    expect(unplacedResources(resources, elements).map((r) => r.id)).toEqual(['d2', 'b1']);
  });

  it('offers only free resources of the shape type', () => {
    const elements = [desk('a', 'd1'), desk('b')];

    expect(bindingCandidates(resources, elements, desk('b')).map((r) => r.id)).toEqual(['d2']);
    expect(bindingCandidates(resources, elements, room('r')).map((r) => r.id)).toEqual(['m1']);
  });

  it('binds and unbinds without touching the original', () => {
    const original = desk('a');
    const bound = withBinding(original, 'd1');

    expect(bound.resourceId).toBe('d1');
    expect(original.resourceId).toBeUndefined();
    expect('resourceId' in withBinding(bound, null)).toBe(false);
  });

  it('finds the unbound desks and rooms, ignoring walls', () => {
    expect(unboundShapes([desk('a', 'd1'), desk('b'), room('r'), wall]).map((e) => e.id)).toEqual(['b', 'r']);
  });

  it('drops bindings to deleted resources, to the wrong type and second copies', () => {
    const cleaned = withoutStaleBindings([desk('a', 'gone'), desk('b', 'm1'), desk('c', 'd1'), desk('d', 'd1')], resources);

    expect(cleaned.map((e) => ('resourceId' in e ? e.resourceId : undefined))).toEqual([undefined, undefined, 'd1', undefined]);
  });

  it('makes a bound shape for each placeable type', () => {
    const at = { x: 1000.4, y: 500 };

    expect(shapeForResource(resource('d1', 'DESK'), at)).toMatchObject({ type: 'DESK', position: { x: 1000, y: 500 }, resourceId: 'd1' });
    expect(shapeForResource(resource('p1', 'PHONE_BOOTH'), at)).toMatchObject({ type: 'PHONE_BOOTH', resourceId: 'p1' });
    expect(shapeForResource(resource('s1', 'PARKING_SPOT'), at)).toMatchObject({ type: 'PARKING_SPOT', resourceId: 's1' });
    const meeting = shapeForResource(resource('m1', 'MEETING_ROOM', 'Atlas'), at);
    expect(meeting).toMatchObject({ type: 'ROOM', label: 'Atlas', resourceId: 'm1' });
    expect(meeting && 'points' in meeting ? meeting.points.length : 0).toBe(4);
    expect(shapeForResource(resource('b1', 'BREAK_ROOM'), at)).toMatchObject({ type: 'BREAK_ROOM', resourceId: 'b1' });
  });
});
