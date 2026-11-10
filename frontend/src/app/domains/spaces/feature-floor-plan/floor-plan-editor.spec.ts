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
    const pressed = Array.from(root.querySelectorAll('button[aria-pressed="true"]'));
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

  describe('editing existing elements', () => {
    const shortcut = (k: string, init: KeyboardEventInit = {}, target: EventTarget = svg) => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true, ...init }));
      settle();
    };

    const placeDesk = (x: number, y: number) => {
      tool('Desk');
      click(x, y);
      tool('Select');
    };

    const field = (name: string) => root.querySelector<HTMLInputElement>(`#prop-${name}`)!;

    const type = (name: string, value: string) => {
      const input = field(name);
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      settle();
    };

    const transformOf = () => root.querySelector('[data-element="DESK"]')?.getAttribute('transform');

    it('drags a selected desk and undoes and redoes the move with Ctrl+Z and Ctrl+Y', () => {
      placeDesk(100, 80);
      const placed = transformOf();
      drag(100, 80, 180, 120);
      const moved = transformOf();
      expect(moved).not.toBe(placed);

      shortcut('z');
      expect(transformOf()).toBe(placed);
      shortcut('y');
      expect(transformOf()).toBe(moved);
      shortcut('z');
      shortcut('Z', { shiftKey: true });
      expect(transformOf()).toBe(moved);
    });

    it('undoes creation and deletion, also with the Undo and Redo buttons', () => {
      placeDesk(100, 80);
      click(100, 80);
      key('Delete');
      expect(count('DESK')).toBe(0);

      shortcut('z');
      expect(count('DESK')).toBe(1);
      const redoButton = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Redo')!;
      redoButton.click();
      settle();
      expect(count('DESK')).toBe(0);
      const undoButton = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Undo')!;
      undoButton.click();
      settle();
      expect(count('DESK')).toBe(1);
    });

    it('copies and pastes with Ctrl+C and Ctrl+V and selects the offset copy', () => {
      placeDesk(100, 80);
      click(100, 80);
      shortcut('c');
      shortcut('v');
      expect(count('DESK')).toBe(2);
      expect(root.querySelectorAll('[data-selection]')).toHaveLength(1);
      const [original, copy] = Array.from(root.querySelectorAll('[data-element="DESK"]')).map((d) => d.getAttribute('transform'));
      expect(copy).not.toBe(original);
    });

    it('shows handles around the selection and the properties of the element', () => {
      placeDesk(100, 80);
      click(100, 80);
      expect(root.querySelectorAll('[data-handle]')).toHaveLength(5);
      expect(field('width').value).toBe('140');
      expect(field('height').value).toBe('70');
      expect(field('angle').value).toBe('0');
    });

    it('applies typed properties and records them as undo steps', () => {
      placeDesk(100, 80);
      click(100, 80);
      type('width', '300');
      type('angle', '45');
      expect(transformOf()).toContain('rotate(45)');
      expect(root.querySelector('[data-element="DESK"] use')?.getAttribute('width')).toBe('300');

      shortcut('z');
      expect(transformOf()).toContain('rotate(0)');
      expect(field('angle').value).toBe('0');
    });

    it('restores the field when the typed value is refused', () => {
      placeDesk(100, 80);
      click(100, 80);
      type('x', '');
      expect(field('x').value).not.toBe('');
    });

    it('leaves the keys to the field while the user is typing', () => {
      placeDesk(100, 80);
      click(100, 80);
      type('width', '300');
      const input = field('width');
      // native text undo, copy, paste and Delete belong to the field, not the plan
      shortcut('z', {}, input);
      shortcut('y', {}, input);
      shortcut('c', {}, input);
      shortcut('v', {}, input);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
      settle();

      expect(count('DESK')).toBe(1);
      expect(root.querySelector('[data-element="DESK"] use')?.getAttribute('width')).toBe('300');
    });

    it('selects with a box and moves several elements together', () => {
      placeDesk(100, 80);
      tool('Desk');
      click(300, 80);
      tool('Select');
      drag(10, 10, 450, 200);
      expect(root.querySelectorAll('[data-selection]')).toHaveLength(2);
      expect(root.querySelector('[data-testid="properties-panel"] input')).toBeNull();

      const before = Array.from(root.querySelectorAll('[data-element="DESK"]')).map((d) => d.getAttribute('transform'));
      drag(100, 80, 130, 100);
      const after = Array.from(root.querySelectorAll('[data-element="DESK"]')).map((d) => d.getAttribute('transform'));
      expect(after).not.toEqual(before);
    });

    it('rotates with the handle, snapping to 15 degrees while Shift is held', () => {
      placeDesk(100, 80);
      click(100, 80);
      const handle = root.querySelector('[data-handle="rotate"]')!.getBoundingClientRect();
      const rect = svg.getBoundingClientRect();
      const from = { x: handle.left + handle.width / 2 - rect.left, y: handle.top + handle.height / 2 - rect.top };
      pointer('pointerdown', from.x, from.y);
      pointer('pointermove', from.x + 60, from.y + 5, { shiftKey: true });
      pointer('pointerup', from.x + 60, from.y + 5, { shiftKey: true });
      const angle = Number(/rotate\(([-\d.]+)\)/.exec(transformOf()!)![1]);
      expect(angle).toBeGreaterThan(0);
      expect(angle % 15).toBe(0);
    });

    it('keeps Ctrl+C for the browser when page text is selected', () => {
      placeDesk(100, 80);
      click(100, 80);
      const status = root.querySelector('[role="status"]')!;
      window.getSelection()!.selectAllChildren(status);
      const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
      svg.dispatchEvent(event);
      window.getSelection()!.removeAllRanges();
      expect(event.defaultPrevented).toBe(false);
      shortcut('v');
      expect(count('DESK')).toBe(1); // nothing was copied, so nothing pastes
    });

    it('does not take a shortcut that has nothing to do', () => {
      for (const k of ['z', 'y', 'c', 'v']) {
        const event = new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true });
        svg.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
    });

    it('takes a shortcut that did something', () => {
      placeDesk(100, 80);
      const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
      svg.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('does not undo an earlier element while a wall is half drawn', () => {
      placeDesk(100, 80);
      tool('Wall');
      click(50, 150);
      click(200, 150);
      shortcut('z');
      expect(count('DESK')).toBe(1);
      key('Enter');
      expect(count('WALL')).toBe(1);
    });
  });
});

