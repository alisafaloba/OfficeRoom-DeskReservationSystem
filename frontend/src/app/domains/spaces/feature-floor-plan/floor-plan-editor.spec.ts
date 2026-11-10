import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FloorPlanEditor } from './floor-plan-editor';

/** Drives the whole editor the way an admin does: toolbar, pointer and keyboard on the canvas. */
describe('FloorPlanEditor', () => {
  let fixture: ComponentFixture<FloorPlanEditor>;
  let root: HTMLElement;
  let svg: SVGSVGElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(FloorPlanEditor);
    fixture.detectChanges();
    root = fixture.nativeElement;
    svg = root.querySelector('svg')!;
  });

  const settle = () => fixture.detectChanges();

  function pointer(type: string, x: number, y: number, init: PointerEventInit = {}) {
    const rect = svg.getBoundingClientRect();
    svg.dispatchEvent(
      new PointerEvent(type, { clientX: rect.left + x, clientY: rect.top + y, bubbles: true, button: 0, pointerId: 1, ...init }),
    );
    settle();
  }

  const click = (x: number, y: number) => {
    pointer('pointerdown', x, y);
    pointer('pointerup', x, y);
  };

  const dblclick = (x: number, y: number) => {
    click(x, y);
    click(x, y);
    svg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    settle();
  };

  const drag = (x1: number, y1: number, x2: number, y2: number) => {
    pointer('pointerdown', x1, y1);
    pointer('pointermove', (x1 + x2) / 2, (y1 + y2) / 2);
    pointer('pointermove', x2, y2);
    pointer('pointerup', x2, y2);
  };

  const key = (k: string) => {
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    settle();
  };

  const tool = (name: string) => {
    const button = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === name)!;
    button.click();
    settle();
  };

  const count = (type: string) => root.querySelectorAll(`[data-element="${type}"]`).length;

  it('marks the active tool as pressed and shows its hint', () => {
    tool('Wall');
    const pressed = Array.from(root.querySelectorAll('app-plan-toolbar button[aria-pressed="true"]'));
    expect(pressed.map((b) => b.textContent?.trim())).toEqual(['Wall']);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Double-click or Enter finishes');
  });

  it('draws a wall with clicks and finishes on double-click', () => {
    tool('Wall');
    click(50, 50);
    click(200, 50);
    expect(root.querySelector('[data-draft]')).not.toBeNull();
    dblclick(200, 120);

    expect(count('WALL')).toBe(1);
    expect(root.querySelector('[data-draft]')).toBeNull();
  });

  it('finishes a wall on Enter and cancels one on Escape', () => {
    tool('Wall');
    click(50, 50);
    click(200, 50);
    key('Enter');
    expect(count('WALL')).toBe(1);

    click(50, 100);
    click(200, 100);
    key('Escape');
    expect(count('WALL')).toBe(1);
    expect(root.querySelector('[data-draft]')).toBeNull();
  });

  it('draws the floor outline as a closed polygon', () => {
    tool('Outline');
    click(20, 20);
    click(250, 20);
    click(250, 120);
    key('Enter');
    expect(count('OUTLINE')).toBe(1);
  });

  it('drags a zone', () => {
    tool('Zone');
    drag(20, 20, 220, 120);
    expect(count('ZONE')).toBe(1);
  });

  it('asks for the label after a room is drawn and shows it', async () => {
    tool('Room');
    drag(10, 10, 280, 140);
    expect(count('ROOM')).toBe(0);

    const dialog = root.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    const input = dialog.querySelector('input')!;
    input.value = 'Board room';
    input.dispatchEvent(new Event('input'));
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    settle();

    expect(count('ROOM')).toBe(1);
    expect(root.querySelector('[data-label-for="ROOM"] text')?.textContent).toContain('Board room');
    expect(root.querySelector('dialog')).toBeNull();
  });

  it('discards the room when the label dialog is cancelled', () => {
    tool('Room');
    drag(10, 10, 280, 140);
    root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    settle();

    expect(count('ROOM')).toBe(0);
    expect(root.querySelector('dialog')).toBeNull();
  });

  it('places a desk icon with one click', () => {
    tool('Desk');
    click(100, 80);
    expect(count('DESK')).toBe(1);
    expect(root.querySelector('[data-element="DESK"] use')).not.toBeNull();
  });

  it('places the decorative element chosen in the palette', () => {
    tool('Elevator');
    click(120, 90);
    const placed = root.querySelector('[data-element="DECOR"]');
    expect(placed?.getAttribute('data-kind')).toBe('ELEVATOR');
    expect(placed?.querySelector('use')?.getAttribute('href')).toBe('#plan-elevator');
  });

  it('selects an element and deletes it with the Delete key', () => {
    tool('Desk');
    click(100, 80);
    tool('Select');
    click(100, 80);
    expect(root.querySelector('[data-selection]')).not.toBeNull();
    key('Delete');
    expect(count('DESK')).toBe(0);
  });

  it('zooms with the wheel and pans with the middle button', () => {
    const transform = () => svg.querySelector(':scope > g')!.getAttribute('transform');
    const before = transform();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    settle();
    const zoomed = transform();
    expect(zoomed).not.toBe(before);

    pointer('pointerdown', 50, 50, { button: 1 });
    pointer('pointermove', 80, 90, { button: 1 });
    pointer('pointerup', 80, 90, { button: 1 });
    expect(transform()).not.toBe(zoomed);
    expect(count('WALL')).toBe(0);
  });

  it('stores plan units whatever the zoom: the same plan spot gives the same coordinates', () => {
    const world = () => svg.querySelector(':scope > g')!.getAttribute('transform')!;
    const screenOf = (plan: { x: number; y: number }) => {
      const [, panX, panY, zoom] = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(world())!.map(Number);
      return { x: plan.x * zoom + panX, y: plan.y * zoom + panY };
    };
    const deskPositions = () =>
      Array.from(root.querySelectorAll('[data-element="DESK"]')).map((d) => d.getAttribute('transform'));

    tool('Desk');
    const target = { x: 500, y: 400 };
    click(screenOf(target).x, screenOf(target).y);
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    settle();
    // Same plan spot, now at another screen position, would be a duplicate; a spot 600 cm away is not.
    click(screenOf({ x: 1100, y: 400 }).x, screenOf({ x: 1100, y: 400 }).y);

    expect(deskPositions()).toEqual(['translate(500 400) rotate(0)', 'translate(1100 400) rotate(0)']);
  });

  it('fits the drawn plan inside the canvas with "Fit to screen"', () => {
    const transform = () => svg.querySelector(':scope > g')!.getAttribute('transform');
    tool('Wall');
    click(50, 50);
    click(200, 50);
    key('Enter');
    tool('Desk');
    click(100, 200);
    const before = transform();

    tool('Fit to screen');

    expect(transform()).not.toBe(before);
    const canvas = svg.getBoundingClientRect();
    for (const type of ['WALL', 'DESK']) {
      const box = root.querySelector(`[data-element="${type}"]`)!.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(canvas.left - 1);
      expect(box.top).toBeGreaterThanOrEqual(canvas.top - 1);
      expect(box.right).toBeLessThanOrEqual(canvas.right + 1);
      expect(box.bottom).toBeLessThanOrEqual(canvas.bottom + 1);
    }
  });

  it('returns to the starting view with "Fit to screen" on an empty plan', () => {
    const transform = () => svg.querySelector(':scope > g')!.getAttribute('transform');
    const start = transform();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    settle();
    expect(transform()).not.toBe(start);

    tool('Fit to screen');

    expect(transform()).toBe(start);
  });

  it('draws a grid that disappears when the cells get too small to read', () => {
    expect(root.querySelector('[data-grid]')).not.toBeNull();
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: 600, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    settle();
    expect(root.querySelector('[data-grid]')).toBeNull();
  });

  it('snaps a placed desk to the grid and stops snapping when "Snap to grid" is switched off', () => {
    const snapButton = () => Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Snap to grid')!;
    const deskTransforms = () =>
      Array.from(root.querySelectorAll('[data-element="DESK"]')).map((d) => d.getAttribute('transform'));
    expect(snapButton().getAttribute('aria-pressed')).toBe('true');

    // At the starting view (zoom 0.25, pan 40) screen (70, 60) is plan (120, 80).
    tool('Desk');
    click(70, 60);
    expect(deskTransforms()).toEqual(['translate(100 100) rotate(0)']);

    tool('Snap to grid');
    expect(snapButton().getAttribute('aria-pressed')).toBe('false');
    click(70, 60);
    expect(deskTransforms()).toEqual(['translate(100 100) rotate(0)', 'translate(120 80) rotate(0)']);
  });
});
