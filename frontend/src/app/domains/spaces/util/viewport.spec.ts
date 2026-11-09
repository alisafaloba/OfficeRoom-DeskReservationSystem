import { counterScale, fitLabel, MAX_ZOOM, MIN_ZOOM, panBy, planToScreen, screenToPlan, zoomAt } from './viewport';

const viewports = [0.05, 0.25, 1, 4].map((zoom) => ({ zoom, panX: 37, panY: -120 }));

describe('viewport', () => {
  it('round-trips plan -> screen -> plan at every zoom level', () => {
    for (const viewport of viewports) {
      const plan = { x: 1234, y: 567 };
      const back = screenToPlan(viewport, planToScreen(viewport, plan));
      expect(back.x).toBeCloseTo(plan.x, 6);
      expect(back.y).toBeCloseTo(plan.y, 6);
    }
  });

  it('maps the same plan point from different screen clicks at different zooms', () => {
    const plan = { x: 800, y: 400 };
    const rounded = viewports.map((v) => {
      const p = screenToPlan(v, planToScreen(v, plan));
      return { x: Math.round(p.x), y: Math.round(p.y) };
    });
    for (const p of rounded) expect(p).toEqual(plan);
  });

  it('zooms around the cursor without moving the point under it', () => {
    const start = { zoom: 0.5, panX: 10, panY: 20 };
    const cursor = { x: 300, y: 200 };
    const before = screenToPlan(start, cursor);
    const zoomed = zoomAt(start, cursor, 2);
    expect(zoomed.zoom).toBe(1);
    const after = screenToPlan(zoomed, cursor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('clamps the zoom range', () => {
    const start = { zoom: 1, panX: 0, panY: 0 };
    expect(zoomAt(start, { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(start, { x: 0, y: 0 }, 0.00001).zoom).toBe(MIN_ZOOM);
  });

  it('pans', () => {
    expect(panBy({ zoom: 1, panX: 1, panY: 2 }, 10, -5)).toEqual({ zoom: 1, panX: 11, panY: -3 });
  });

  it('keeps labels the same size on screen at every zoom', () => {
    for (const viewport of viewports) {
      expect(counterScale(viewport) * viewport.zoom).toBeCloseTo(1, 10);
    }
  });

  it('keeps a label whole when it fits and ellipsizes it to the shape otherwise', () => {
    const zoomedIn = { zoom: 1, panX: 0, panY: 0 };
    const medium = { zoom: 0.25, panX: 0, panY: 0 };
    const zoomedOut = { zoom: 0.02, panX: 0, panY: 0 };
    expect(fitLabel('Meeting room A', 400, 8, zoomedIn)).toBe('Meeting room A');
    expect(fitLabel('Meeting room A', 400, 8, medium)).toBe('Meeting roo…');
    expect(fitLabel('Meeting room A', 400, 8, zoomedOut)).toBe('…');
  });
});
