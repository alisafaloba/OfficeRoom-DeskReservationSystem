import { PlanElement } from '@app/spaces/models/floor-plan';
import {
  boundsOf,
  distanceToPolyline,
  elementsBounds,
  hitTest,
  inDrawOrder,
  labelAnchor,
  pointInPolygon,
  rectPoints,
  roundPoint,
} from './plan-geometry';

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('plan geometry', () => {
  it('builds a rectangle from two opposite corners in any direction', () => {
    const expected = rectPoints({ x: 10, y: 20 }, { x: 50, y: 80 });
    expect(rectPoints({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual(expected);
    expect(expected).toEqual([
      { x: 10, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 80 },
      { x: 10, y: 80 },
    ]);
  });

  it('rounds points to whole plan units', () => {
    expect(roundPoint({ x: 1.4, y: 2.6 })).toEqual({ x: 1, y: 3 });
  });

  it('computes bounds', () => {
    expect(boundsOf(square)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  });

  it('tests point in polygon', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });

  it('anchors a label at the centroid, or inside a concave shape', () => {
    expect(labelAnchor(square)).toEqual({ x: 50, y: 50 });
    const u = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 70 },
      { x: 70, y: 70 },
      { x: 70, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon(labelAnchor(u), u)).toBe(true);
  });

  it('measures distance to an open and a closed polyline', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(distanceToPolyline({ x: 50, y: 10 }, line, false)).toBe(10);
    expect(distanceToPolyline({ x: 0, y: 50 }, square, true)).toBe(0);
    expect(distanceToPolyline({ x: 0, y: 50 }, [...square.slice(0, 3)], false)).toBe(50);
  });

  const room: PlanElement = { id: 'room', type: 'ROOM', points: square, label: 'A' };
  const desk: PlanElement = {
    id: 'desk',
    type: 'DESK',
    position: { x: 50, y: 50 },
    width: 20,
    height: 10,
    rotation: 0,
  };
  const wall: PlanElement = {
    id: 'wall',
    type: 'WALL',
    points: [
      { x: 0, y: 200 },
      { x: 100, y: 200 },
    ],
    thickness: 20,
  };

  it('draws rooms, then zones, walls, decor, and desks last', () => {
    const door: PlanElement = {
      id: 'door',
      type: 'DECOR',
      kind: 'DOOR',
      position: { x: 0, y: 200 },
      width: 90,
      height: 20,
      rotation: 0,
    };
    const zone: PlanElement = { id: 'zone', type: 'ZONE', points: square };
    expect(inDrawOrder([desk, door, wall, zone, room]).map((e) => e.id)).toEqual([
      'room',
      'zone',
      'wall',
      'door',
      'desk',
    ]);
  });

  it('keeps a zone drawn over a room but selects the room when both are under the click', () => {
    const zone: PlanElement = { id: 'zone', type: 'ZONE', points: square };
    expect(hitTest([zone, room], { x: 10, y: 10 }, 1)).toBe('room');
    expect(hitTest([room, zone], { x: 10, y: 10 }, 1)).toBe('room');
  });

  it('hits the desk above its room, then the room, then nothing', () => {
    expect(hitTest([room, desk], { x: 50, y: 50 }, 1)).toBe('desk');
    expect(hitTest([room, desk], { x: 10, y: 10 }, 1)).toBe('room');
    expect(hitTest([room, desk], { x: 500, y: 500 }, 1)).toBeNull();
  });

  it('hits a rotated desk along its rotated axis', () => {
    const rotated: PlanElement = { ...desk, id: 'r', type: 'DESK', rotation: 90 } as PlanElement;
    expect(hitTest([rotated], { x: 50, y: 58 }, 1)).toBe('r');
    expect(hitTest([rotated], { x: 62, y: 50 }, 1)).toBeNull();
  });

  it('keeps thin walls clickable when zoomed far out', () => {
    expect(hitTest([wall], { x: 50, y: 230 }, 1)).toBeNull();
    expect(hitTest([wall], { x: 50, y: 230 }, 0.1)).toBe('wall');
  });
});

describe('elementsBounds', () => {
  const room: PlanElement = { id: 'room', type: 'ROOM', points: square, label: 'A' };
  const wall: PlanElement = {
    id: 'wall',
    type: 'WALL',
    points: [
      { x: 0, y: 200 },
      { x: 100, y: 200 },
    ],
    thickness: 20,
  };
  const desk = (rotation: number): PlanElement => ({
    id: 'desk',
    type: 'DESK',
    position: { x: 50, y: 50 },
    width: 20,
    height: 10,
    rotation,
  });

  it('is null for an empty plan', () => {
    expect(elementsBounds([])).toBeNull();
  });

  it('spans the points of polygons and polylines', () => {
    expect(elementsBounds([room, wall])).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 200 });
  });

  it('spans the size of an unrotated desk around its centre', () => {
    expect(elementsBounds([desk(0)])).toEqual({ minX: 40, minY: 45, maxX: 60, maxY: 55 });
  });

  it('swaps width and height for a desk rotated by 90 degrees', () => {
    const bounds = elementsBounds([desk(90)]);
    expect(bounds?.minX).toBeCloseTo(45, 10);
    expect(bounds?.maxX).toBeCloseTo(55, 10);
    expect(bounds?.minY).toBeCloseTo(40, 10);
    expect(bounds?.maxY).toBeCloseTo(60, 10);
  });

  it('grows the box for a desk rotated by 45 degrees', () => {
    const bounds = elementsBounds([desk(45)]);
    const half = ((20 + 10) / 2) * Math.SQRT1_2; // half-extent of a 20 x 10 rectangle turned 45 degrees
    expect(bounds?.minX).toBeCloseTo(50 - half, 10);
    expect(bounds?.maxX).toBeCloseTo(50 + half, 10);
    expect(bounds?.minY).toBeCloseTo(50 - half, 10);
    expect(bounds?.maxY).toBeCloseTo(50 + half, 10);
  });

  it('covers everything when shapes and placed elements are mixed', () => {
    const far: PlanElement = { ...desk(0), id: 'far', position: { x: 400, y: -100 } } as PlanElement;
    expect(elementsBounds([room, wall, far])).toEqual({ minX: 0, minY: -105, maxX: 410, maxY: 200 });
  });
});
