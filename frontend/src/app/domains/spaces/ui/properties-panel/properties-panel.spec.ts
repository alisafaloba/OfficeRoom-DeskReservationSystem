import { TestBed } from '@angular/core/testing';
import { PlanElement } from '@app/spaces/models/floor-plan';
import { PropertiesPanel } from './properties-panel';

const desk: PlanElement = {
  id: 'd',
  type: 'DESK',
  position: { x: 250, y: 150 },
  width: 140,
  height: 70,
  rotation: 0,
};
const room: PlanElement = {
  id: 'r',
  type: 'ROOM',
  label: 'Board room',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
};
const wall: PlanElement = {
  id: 'w',
  type: 'WALL',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  thickness: 20,
};

function render(inputs: { element?: PlanElement | null; zoomPercent?: number; snap?: boolean; gridSize?: number } = {}) {
  const fixture = TestBed.createComponent(PropertiesPanel);
  fixture.componentRef.setInput('element', inputs.element ?? null);
  fixture.componentRef.setInput('zoomPercent', inputs.zoomPercent ?? 25);
  fixture.componentRef.setInput('snap', inputs.snap ?? true);
  fixture.componentRef.setInput('gridSize', inputs.gridSize ?? 50);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const button = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;

describe('PropertiesPanel', () => {
  it('says nothing is selected and offers no delete button', () => {
    const { el } = render();
    expect(el.textContent).toContain('Nothing selected');
    expect(button(el, 'Delete')).toBeUndefined();
  });

  it('describes a selected desk by position and size', () => {
    const { el } = render({ element: desk });
    expect(el.textContent).toContain('Desk');
    expect(el.textContent).toContain('250, 150 cm');
    expect(el.textContent).toContain('140 \u00d7 70 cm');
  });

  it('describes a selected room by its label and corner count', () => {
    const { el } = render({ element: room });
    expect(el.textContent).toContain('Room');
    expect(el.textContent).toContain('Board room');
    expect(el.textContent).toContain('4');
  });

  it('describes a wall by its point count', () => {
    const { el } = render({ element: wall });
    expect(el.textContent).toContain('Wall');
    expect(el.textContent).toContain('Points');
  });

  it('emits delete', () => {
    const { fixture, el } = render({ element: desk });
    let deleted = 0;
    fixture.componentInstance.deleted.subscribe(() => deleted++);
    button(el, 'Delete').click();
    expect(deleted).toBe(1);
  });

  it('shows the zoom level and emits the zoom and fit actions', () => {
    const { fixture, el } = render({ zoomPercent: 125 });
    expect(el.querySelector('output')?.textContent?.trim()).toBe('125%');

    const events: string[] = [];
    fixture.componentInstance.zoomedIn.subscribe(() => events.push('in'));
    fixture.componentInstance.zoomedOut.subscribe(() => events.push('out'));
    fixture.componentInstance.fitted.subscribe(() => events.push('fit'));
    (el.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click();
    (el.querySelector('button[aria-label="Zoom out"]') as HTMLButtonElement).click();
    button(el, 'Fit to screen').click();
    expect(events).toEqual(['in', 'out', 'fit']);
  });

  it('shows whether snapping is on and emits the toggle', () => {
    const on = render({ snap: true });
    expect(button(on.el, 'Snap to grid').getAttribute('aria-pressed')).toBe('true');
    let toggled = 0;
    on.fixture.componentInstance.snapToggled.subscribe(() => toggled++);
    button(on.el, 'Snap to grid').click();
    expect(toggled).toBe(1);

    expect(button(render({ snap: false }).el, 'Snap to grid').getAttribute('aria-pressed')).toBe('false');
  });

  it('offers the grid sizes, selects the current one and emits a new choice', () => {
    const { fixture, el } = render({ gridSize: 25 });
    const select = el.querySelector('select')!;
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['10 cm', '25 cm', '50 cm', '100 cm']);
    expect(select.value).toBe('25');

    const chosen: number[] = [];
    fixture.componentInstance.gridSizeChosen.subscribe((s) => chosen.push(s));
    select.value = '100';
    select.dispatchEvent(new Event('change'));
    expect(chosen).toEqual([100]);
  });
});
