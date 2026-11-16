import { Point } from '@app/spaces/models/floor-plan';
import {
  doubleClick,
  DrawEffect,
  DrawState,
  initialDrawState,
  isDrawing,
  keyDown,
  pointerDown,
  pointerMove,
  pointerUp,
  selectTool,
  Step,
  Tool,
} from './drawing-machine';

/** Drives the machine like a user would and records every effect. */
class Driver {
  state: DrawState;
  effects: DrawEffect[] = [];

  constructor(
    tool: Tool,
    private readonly zoom = 1,
  ) {
    this.state = selectTool(initialDrawState(), tool);
  }

  private apply(step: Step): this {
    this.state = step.state;
    if (step.effect) this.effects.push(step.effect);
    return this;
  }

  click(x: number, y: number): this {
    const input = { point: { x, y }, zoom: this.zoom };
    return this.apply(pointerDown(this.state, input)).apply(pointerUp(this.state, input));
  }

  drag(from: Point, to: Point): this {
    const down = { point: from, zoom: this.zoom };
    this.apply(pointerDown(this.state, down));
    this.apply(pointerMove(this.state, { point: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, zoom: this.zoom }));
    this.apply(pointerMove(this.state, { point: to, zoom: this.zoom }));
    return this.apply(pointerUp(this.state, { point: to, zoom: this.zoom }));
  }

  dblclick(x: number, y: number): this {
    return this.click(x, y).click(x, y).apply(doubleClick(this.state));
  }

  key(key: string): this {
    return this.apply(keyDown(this.state, key));
  }
}

describe('drawing machine', () => {
  describe('wall', () => {
    it('finishes with Enter after two or more points', () => {
      const d = new Driver('WALL').click(0, 0).click(100, 0).click(100, 100).key('Enter');
      expect(d.effects).toEqual([
        {
          type: 'commit',
          element: {
            type: 'WALL',
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 100 },
            ],
            thickness: 20,
          },
        },
      ]);
      expect(isDrawing(d.state)).toBe(false);
    });

    it('finishes on double-click without leaving a zero-length last segment', () => {
      const d = new Driver('WALL').click(0, 0).dblclick(200, 0);
      expect(d.effects).toHaveLength(1);
      expect(d.effects[0]).toMatchObject({
        element: { type: 'WALL', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] },
      });
    });

    it('does not finish with a single point', () => {
      const d = new Driver('WALL').click(0, 0).key('Enter');
      expect(d.effects).toEqual([]);
      expect(d.state.points).toHaveLength(1);
    });

    it('Backspace removes the last point', () => {
      const d = new Driver('WALL').click(0, 0).click(50, 0).key('Backspace');
      expect(d.state.points).toEqual([{ x: 0, y: 0 }]);
    });

    it('Escape cancels the drawing, a second Escape returns to the select tool', () => {
      const d = new Driver('WALL').click(0, 0).click(50, 0).key('Escape');
      expect(d.state.points).toEqual([]);
      expect(d.state.tool).toBe('WALL');
      expect(d.effects).toEqual([]);
      d.key('Escape');
      expect(d.state.tool).toBe('SELECT');
    });

    it('tracks the cursor for the rubber-band segment', () => {
      const d = new Driver('WALL').click(0, 0);
      d.state = pointerMove(d.state, { point: { x: 30.4, y: 40.6 }, zoom: 1 }).state;
      expect(d.state.cursor).toEqual({ x: 30, y: 41 });
    });
  });

  describe('outline', () => {
    it('needs three points and closes on Enter', () => {
      const d = new Driver('OUTLINE').click(0, 0).click(100, 0).key('Enter');
      expect(d.effects).toEqual([]);
      d.click(100, 100).key('Enter');
      expect(d.effects[0]).toMatchObject({ element: { type: 'OUTLINE', thickness: 30 } });
    });
  });

  describe('zone and room', () => {
    it('a drag creates a rectangle zone', () => {
      const d = new Driver('ZONE').drag({ x: 10, y: 20 }, { x: 110, y: 90 });
      expect(d.effects).toEqual([
        {
          type: 'commit',
          element: {
            type: 'ZONE',
            points: [
              { x: 10, y: 20 },
              { x: 110, y: 20 },
              { x: 110, y: 90 },
              { x: 10, y: 90 },
            ],
          },
        },
      ]);
    });

    it('a drag creates a rectangle room and asks for the label instead of committing', () => {
      const d = new Driver('ROOM').drag({ x: 0, y: 0 }, { x: 100, y: 100 });
      expect(d.effects).toHaveLength(1);
      expect(d.effects[0]).toMatchObject({ type: 'requestRoomLabel' });
      expect(d.effects[0]).toMatchObject({ points: [{}, {}, {}, {}] });
      expect(isDrawing(d.state)).toBe(false);
    });

    it('clicks build a polygon room, closed by clicking the first point', () => {
      const d = new Driver('ROOM').click(0, 0).click(100, 0).click(100, 100).click(0, 100).click(2, 2);
      expect(d.effects).toHaveLength(1);
      expect(d.effects[0]).toMatchObject({ type: 'requestRoomLabel' });
      expect(d.effects[0]).toMatchObject({ points: [{}, {}, {}, {}] });
    });

    it('a polygon finishes on double-click', () => {
      const d = new Driver('ZONE').click(0, 0).click(100, 0).dblclick(100, 100);
      expect(d.effects[0]).toMatchObject({ element: { type: 'ZONE' } });
    });

    it('a tiny drag is a click, not a rectangle', () => {
      const d = new Driver('ROOM').drag({ x: 0, y: 0 }, { x: 2, y: 2 });
      expect(d.effects).toEqual([]);
      expect(d.state.points).toHaveLength(1);
    });

    it('treats drag distance in screen pixels, so a short drag still works when zoomed in', () => {
      const d = new Driver('ZONE', 4).drag({ x: 0, y: 0 }, { x: 10, y: 10 });
      expect(d.effects[0]).toMatchObject({ element: { type: 'ZONE' } });
    });

    it('Escape discards the polygon without any effect', () => {
      const d = new Driver('ROOM').click(0, 0).click(100, 0).click(100, 100).key('Escape');
      expect(d.effects).toEqual([]);
      expect(d.state.points).toEqual([]);
    });
  });

  describe('desk and decor', () => {
    it('a click places a desk at the default size, centered on the click', () => {
      const d = new Driver('DESK').click(300, 200);
      expect(d.effects).toEqual([
        {
          type: 'commit',
          element: { type: 'DESK', position: { x: 300, y: 200 }, width: 140, height: 70, rotation: 0 },
        },
      ]);
    });

    it('places the chosen decorative kind at that kind’s default size', () => {
      const d = new Driver('DECOR');
      d.state = selectTool(d.state, 'DECOR', 'ELEVATOR');
      d.click(10, 10);
      expect(d.effects[0]).toMatchObject({
        element: { type: 'DECOR', kind: 'ELEVATOR', width: 200, height: 200 },
      });
    });

    it('stores the same plan point whatever the zoom', () => {
      for (const zoom of [0.05, 1, 4]) {
        const d = new Driver('DESK', zoom).click(300.2, 199.9);
        expect(d.effects[0]).toMatchObject({ element: { position: { x: 300, y: 200 } } });
      }
    });
  });

  describe('select', () => {
    it('does not draw anything on a click', () => {
      expect(new Driver('SELECT').click(5, 6).effects).toEqual([]);
    });

    it('Delete removes the selection only in the select tool', () => {
      expect(new Driver('SELECT').key('Delete').effects).toEqual([{ type: 'deleteSelected' }]);
      expect(new Driver('WALL').key('Delete').effects).toEqual([]);
    });
  });

  it('switching tool abandons the drawing in progress', () => {
    const d = new Driver('WALL').click(0, 0).click(50, 0);
    d.state = selectTool(d.state, 'ROOM');
    expect(d.state.points).toEqual([]);
    expect(d.state.tool).toBe('ROOM');
  });
});
