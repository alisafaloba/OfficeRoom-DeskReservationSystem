import {
  counterScale,
  fitLabel,
  fitToBounds,
  INITIAL_VIEWPORT,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  planToScreen,
  screenToPlan,
  zoomAt,
} from './viewport';

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

  it('limits the zoom to 10% - 400%', () => {
    expect(MIN_ZOOM).toBe(0.1);
    expect(MAX_ZOOM).toBe(4);
    expect(INITIAL_VIEWPORT.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(INITIAL_VIEWPORT.zoom).toBeLessThanOrEqual(MAX_ZOOM);
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

  describe('fitToBounds', () => {
    const canvas = { width: 1000, height: 600 };

    it('scales to the tighter axis and centres the plan', () => {
      const view = fitToBounds({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, canvas.width, canvas.height, 50);
      expect(view.zoom).toBeCloseTo(0.9, 10); // width is the limit: (1000 - 2 * 50) / 1000
      expect(view.panX).toBeCloseTo(50, 10);
      expect(view.panY).toBeCloseTo(75, 10);
    });

    it('puts the middle of the plan in the middle of the canvas wherever the plan sits', () => {
      const bounds = { minX: -3000, minY: 800, maxX: -1000, maxY: 1800 };
      const view = fitToBounds(bounds, canvas.width, canvas.height);
      const middle = planToScreen(view, { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 });
      expect(middle.x).toBeCloseTo(canvas.width / 2, 10);
      expect(middle.y).toBeCloseTo(canvas.height / 2, 10);
    });

    it('keeps the whole plan inside the padded canvas', () => {
      const bounds = { minX: 100, minY: 200, maxX: 4100, maxY: 1700 };
      const view = fitToBounds(bounds, canvas.width, canvas.height, 40);
      const topLeft = planToScreen(view, { x: bounds.minX, y: bounds.minY });
      const bottomRight = planToScreen(view, { x: bounds.maxX, y: bounds.maxY });
      expect(topLeft.x).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(topLeft.y).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(bottomRight.x).toBeLessThanOrEqual(canvas.width - 40 + 1e-9);
      expect(bottomRight.y).toBeLessThanOrEqual(canvas.height - 40 + 1e-9);
    });

    it('stays within the zoom limits for tiny and huge plans', () => {
      expect(fitToBounds({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, canvas.width, canvas.height).zoom).toBe(MAX_ZOOM);
      expect(fitToBounds({ minX: 0, minY: 0, maxX: 1e6, maxY: 1e6 }, canvas.width, canvas.height).zoom).toBe(MIN_ZOOM);
    });

    it('handles a plan that is a single point without producing NaN or Infinity', () => {
      const view = fitToBounds({ minX: 500, minY: 500, maxX: 500, maxY: 500 }, canvas.width, canvas.height);
      expect(Number.isFinite(view.zoom)).toBe(true);
      expect(Number.isFinite(view.panX)).toBe(true);
      expect(Number.isFinite(view.panY)).toBe(true);
    });
  });
});
