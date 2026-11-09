import { TestBed } from '@angular/core/testing';
import { DraftPreview } from '@app/spaces/data/floor-plan-editor-store';
import { PlanElement } from '@app/spaces/models/floor-plan';
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

function render(viewport: Viewport, extra: { preview?: DraftPreview | null; selectedId?: string | null } = {}) {
  const fixture = TestBed.createComponent(PlanCanvas);
  fixture.componentRef.setInput('elements', elements);
  fixture.componentRef.setInput('viewport', viewport);
  fixture.componentRef.setInput('preview', extra.preview ?? null);
  fixture.componentRef.setInput('selectedId', extra.selectedId ?? null);
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
    expect(render(one, { selectedId: 'd' }).querySelector('[data-selection] rect')).not.toBeNull();
  });

  it('renders the draft with its handles', () => {
    const el = render(one, { preview: { tool: 'WALL', shape: 'path', points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] } });
    expect(el.querySelector('[data-draft] polyline')).not.toBeNull();
    expect(el.querySelectorAll('[data-draft] circle')).toHaveLength(2);
  });
});
