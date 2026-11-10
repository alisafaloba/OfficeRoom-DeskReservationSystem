import { PlanElement } from '@app/spaces/models/floor-plan';
import { applyFrame, copyOf, elementBounds, frameOf, translate } from './plan-transform';

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

const elements: Record<string, PlanElement> = {
  wall: { id: 'a', type: 'WALL', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], thickness: 20 },
  outline: { id: 'a', type: 'OUTLINE', points: square, thickness: 30 },
  zone: { id: 'a', type: 'ZONE', points: square, label: 'Quiet' },
  zoneNoLabel: { id: 'a', type: 'ZONE', points: square },
  room: { id: 'a', type: 'ROOM', points: square, label: 'Meeting' },
  desk: { id: 'a', type: 'DESK', position: { x: 50, y: 50 }, width: 140, height: 70, rotation: 0 },
  decor: { id: 'a', type: 'DECOR', kind: 'PLANT', position: { x: 50, y: 50 }, width: 60, height: 60, rotation: 0 },
};

describe('plan-transform', () => {
  describe('copyOf', () => {
    const keys = (element: PlanElement) => Object.keys(copyOf(element, 'b', 10, 20)).sort();

    it('gives the copy the new id and keeps exactly the geometry fields of each type', () => {
      expect(keys(elements['wall'])).toEqual(['id', 'points', 'thickness', 'type']);
      expect(keys(elements['outline'])).toEqual(['id', 'points', 'thickness', 'type']);
      expect(keys(elements['zone'])).toEqual(['id', 'label', 'points', 'type']);
      expect(keys(elements['zoneNoLabel'])).toEqual(['id', 'points', 'type']);
      expect(keys(elements['room'])).toEqual(['id', 'label', 'points', 'type']);
      expect(keys(elements['desk'])).toEqual(['height', 'id', 'position', 'rotation', 'type', 'width']);
      expect(keys(elements['decor'])).toEqual(['height', 'id', 'kind', 'position', 'rotation', 'type', 'width']);
      expect(copyOf(elements['desk'], 'b', 0, 0).id).toBe('b');
    });

    it('drops anything else the original carries', () => {
      const extra = { ...elements['decor'], resourceId: 'r-1', note: 'x' } as unknown as PlanElement;
      expect(keys(extra)).not.toContain('resourceId');
      expect(keys(extra)).not.toContain('note');
    });

    it('offsets the copy and leaves the original alone', () => {
      expect(copyOf(elements['desk'], 'b', 10, 20)).toMatchObject({ position: { x: 60, y: 70 } });
      expect(copyOf(elements['room'], 'b', 10, 20)).toMatchObject({ points: [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 120 }, { x: 10, y: 120 }] });
      expect(elements['desk']).toMatchObject({ position: { x: 50, y: 50 } });
    });
  });

  describe('translate', () => {
    it('changes only the position, whatever the size or angle', () => {
      const odd = { ...elements['desk'], width: 140.5, height: 70.25, rotation: 12.345 } as PlanElement;
      expect(translate(odd, 5, -5)).toEqual({ ...odd, position: { x: 55, y: 45 } });
    });

    it('moves every point of a shape', () => {
      expect(translate(elements['wall'], 10, 5)).toMatchObject({ points: [{ x: 10, y: 5 }, { x: 210, y: 5 }] });
    });
  });

  describe('applyFrame', () => {
    it('scales a shape about its center and keeps a flat axis flat', () => {
      const wall = elements['wall'];
      const frame = frameOf(wall);
      const wider = applyFrame(wall, { ...frame, width: 400, height: 50 });
      expect(wider).toMatchObject({ points: [{ x: -100, y: 0 }, { x: 300, y: 0 }] });
    });

    it('rounds a placed element to whole units and normalizes its angle', () => {
      const out = applyFrame(elements['desk'], { center: { x: 10.4, y: 10.6 }, width: 99.6, height: 20.2, rotation: 725 });
      expect(out).toMatchObject({ position: { x: 10, y: 11 }, width: 100, height: 20, rotation: 5 });
    });
  });

  it('bounds of a rotated desk cover its turned corners', () => {
    const turned = { ...elements['desk'], rotation: 90 } as PlanElement;
    const box = elementBounds(turned);
    expect(box.maxX - box.minX).toBeCloseTo(70);
    expect(box.maxY - box.minY).toBeCloseTo(140);
  });
});
