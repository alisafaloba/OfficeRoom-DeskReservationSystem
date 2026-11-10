import { TestBed } from '@angular/core/testing';
import { DraftPreview } from '@app/spaces/data/floor-plan-editor-store';
import { PlanElement, Point } from '@app/spaces/models/floor-plan';
import { overlayFor, SelectionOverlay } from '@app/spaces/util/selection-handles';
import { Viewport } from '@app/spaces/util/viewport';
import { PlanCanvas } from './plan-canvas';

const square = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 400 },
  { x: 0, y: 400 },
];

const elements: PlanElement[] = [
  { id: 'z', type: 'ZONE', points: square, label: 'Quiet area' },
  { id: 'r', type: 'ROOM', points: square, label: 'Meeting 1' },
  { id: 'w', type: 'WALL', points: [{ x: 0, y: 0 }, { x: 400, y: 0 }], thickness: 20 },
  { id: 'o', type: 'OUTLINE', points: square, thickness: 30 },
  { id: 'd', type: 'DESK', position: { x: 100, y: 100 }, width: 140, height: 70, rotation: 0 },
  { id: 'p', type: 'DECOR', kind: 'PLANT', position: { x: 300, y: 300 }, width: 60, height: 60, rotation: 0 },
];

function render(viewport: Viewport, extra: { preview?: DraftPreview | null; selectedIds?: string[]; overlay?: SelectionOverlay | null; marquee?: Point[] | null } = {}) {
  const fixture = TestBed.createComponent(PlanCanvas);
  fixture.componentRef.setInput('elements', elements);
  fixture.componentRef.setInput('viewport', viewport);
  fixture.componentRef.setInput('preview', extra.preview ?? null);
  fixture.componentRef.setInput('selectedIds', new Set(extra.selectedIds ?? []));
  fixture.componentRef.setInput('overlay', extra.overlay ?? null);
  fixture.componentRef.setInput('marquee', extra.marquee ?? null);
  fixture.componentRef.setInput('label', 'Floor plan');
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const one = { zoom: 1, panX: 0, panY: 0 };

describe('PlanCanvas', () => {
  it('renders every element type distinctly', () => {
    const el = render(one);
    for (const type of ['ZONE', 'ROOM', 'WALL', 'OUTLINE', 'DESK', 'DECOR']) {
      expect(el.querySelectorAll(`[data-element="${type}"]`)).toHaveLength(1);
    }
  });

  it('draws walls as thick lines in plan units and zones semi-transparent', () => {
    const el = render(one);
    expect(el.querySelector('[data-element="WALL"]')?.getAttribute('stroke-width')).toBe('20');
    const zone = el.querySelector('[data-element="ZONE"] polygon');
    expect(zone?.getAttribute('class')).toContain('fill-sky-500/25');
  });

  it('never draws a wall thinner than two screen pixels when zoomed far out', () => {
    const el = render({ zoom: 0.02, panX: 0, panY: 0 });
    expect(Number(el.querySelector('[data-element="WALL"]')?.getAttribute('stroke-width'))).toBeCloseTo(100);
  });

  it('draws desks and decor as icons', () => {
    const el = render(one);
    expect(el.querySelector('[data-element="DESK"] use')?.getAttribute('href')).toBe('#plan-desk');
    expect(el.querySelector('[data-element="DECOR"] use')?.getAttribute('href')).toBe('#plan-plant');
  });

  it('shows the room label', () => {
    const el = render(one);
    expect(el.querySelector('[data-label-for="ROOM"] text')?.textContent).toContain('Meeting 1');
  });

  it('keeps labels the same size on screen at every zoom level', () => {
    for (const zoom of [0.5, 1, 2, 4]) {
      const el = render({ zoom, panX: 0, panY: 0 });
      const transform = el.querySelector('[data-label-for="ROOM"]')?.getAttribute('transform') ?? '';
      const scale = Number(/scale\(([^)]+)\)/.exec(transform)?.[1]);
      expect(scale * zoom).toBeCloseTo(1, 6);
    }
  });

  it('ellipsizes a label that cannot fit its shape instead of hiding it, and keeps the full text as tooltip', () => {
    const el = render({ zoom: 0.05, panX: 0, panY: 0 });
    const text = el.querySelector('[data-label-for="ROOM"] text')?.textContent ?? '';
    expect(text).toContain('…');
    expect(text.length).toBeLessThan('Meeting 1'.length);
    expect(el.querySelector('[data-element="ROOM"] title')?.textContent).toBe('Meeting 1');
  });

  it('highlights the selected element', () => {
    expect(render(one).querySelector('[data-selection]')).toBeNull();
    expect(render(one, { selectedIds: ['d'] }).querySelector('[data-selection] rect')).not.toBeNull();
  });

  it('highlights every selected element', () => {
    expect(render(one, { selectedIds: ['d', 'p', 'w'] }).querySelectorAll('[data-selection]')).toHaveLength(3);
  });

  it('draws the selection box with four resize handles and a rotate handle', () => {
    const frame = { center: { x: 100, y: 100 }, width: 140, height: 70, rotation: 0 };
    const el = render(one, { overlay: overlayFor(frame, { resizable: true, rotatable: true }, 1) });
    expect(el.querySelectorAll('[data-handle]')).toHaveLength(5);
    expect(el.querySelector('[data-handle="rotate"]')).not.toBeNull();
  });

  it('draws only the box, without handles, for a multi-selection', () => {
    const frame = { center: { x: 100, y: 100 }, width: 300, height: 200, rotation: 0 };
    const el = render(one, { overlay: overlayFor(frame, { resizable: false, rotatable: false }, 1) });
    expect(el.querySelector('[data-selection-box] polygon')).not.toBeNull();
    expect(el.querySelectorAll('[data-handle]')).toHaveLength(0);
  });

  it('draws the selection rectangle while it is dragged', () => {
    const band = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];
    expect(render(one, { marquee: band }).querySelector('[data-marquee]')).not.toBeNull();
    expect(render(one).querySelector('[data-marquee]')).toBeNull();
  });

  it('renders the draft with its handles', () => {
    const el = render(one, { preview: { tool: 'WALL', shape: 'path', points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] } });
    expect(el.querySelector('[data-draft] polyline')).not.toBeNull();
    expect(el.querySelectorAll('[data-draft] circle')).toHaveLength(2);
  });

  describe('grid and pinch zoom', () => {
    function mount(inputs: Record<string, unknown>) {
      const fixture = TestBed.createComponent(PlanCanvas);
      fixture.componentRef.setInput('elements', elements);
      fixture.componentRef.setInput('viewport', { zoom: 0.25, panX: 0, panY: 0 });
      fixture.componentRef.setInput('label', 'Floor plan');
      for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
      fixture.detectChanges();
      const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
      return { fixture, svg, el: fixture.nativeElement as HTMLElement };
    }

    it('draws the grid with the given cell size', () => {
      const { el } = mount({ gridSize: 25 });
      expect(el.querySelector('pattern#plan-grid')?.getAttribute('width')).toBe('25');
      expect(el.querySelector('[data-grid]')).not.toBeNull();
    });

    it('hides a grid whose cells would be under 6 px on screen', () => {
      expect(mount({ gridSize: 10 }).el.querySelector('[data-grid]')).toBeNull(); // 10 cm at 25% = 2.5 px
      expect(mount({ gridSize: 25 }).el.querySelector('[data-grid]')).not.toBeNull(); // 6.25 px
    });

    it('zooms faster for a trackpad pinch (Ctrl + wheel) than for the same wheel delta', () => {
      const { fixture, svg } = mount({});
      const factors: number[] = [];
      fixture.componentInstance.zoomed.subscribe((z) => factors.push(z.factor));
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true }));
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, bubbles: true, cancelable: true }));
      expect(factors[0]).toBeCloseTo(Math.exp(0.015), 10);
      expect(factors[1]).toBeCloseTo(Math.exp(0.1), 10);
    });
  });
});
