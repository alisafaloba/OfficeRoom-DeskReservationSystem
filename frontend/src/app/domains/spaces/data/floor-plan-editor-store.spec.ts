import { TestBed } from '@angular/core/testing';
import { PlanElement } from '@app/spaces/models/floor-plan';
import { copyOf } from '@app/spaces/util/plan-transform';
import { INITIAL_VIEWPORT } from '@app/spaces/util/viewport';
import { FloorPlanEditorStore } from './floor-plan-editor-store';

describe('FloorPlanEditorStore', () => {
  let store: FloorPlanEditorStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FloorPlanEditorStore] });
    store = TestBed.inject(FloorPlanEditorStore);
    // zoom 1, no pan: screen coordinates equal plan coordinates
    store.zoomAt({ x: 0, y: 0 }, 1 / store.viewport().zoom);
    store.panBy(-store.viewport().panX, -store.viewport().panY);
    // The editing tests use free coordinates; the grid tests switch snapping back on.
    store.toggleSnap();
  });

  const click = (x: number, y: number, repeat = false) => {
    store.pointerDown({ x, y });
    store.pointerUp({ x, y }, repeat);
  };

  it('starts in the select tool with an empty plan', () => {
    expect(store.tool()).toBe('SELECT');
    expect(store.elements()).toEqual([]);
    expect(store.preview()).toBeNull();
  });

  it('draws a wall and gives it an id', () => {
    store.chooseTool('WALL');
    click(0, 0);
    click(100, 0);
    expect(store.preview()?.points).toHaveLength(3); // two points + rubber band to the cursor
    store.keyDown('Enter');

    expect(store.elements()).toHaveLength(1);
    const [wall] = store.elements();
    expect(wall).toMatchObject({ type: 'WALL', thickness: 20 });
    expect(wall.id).toBeTruthy();
    expect(store.preview()).toBeNull();
  });

  it('stores plan units, not screen pixels, when the view is zoomed and panned', () => {
    store.chooseTool('DESK');
    store.zoomAt({ x: 0, y: 0 }, 2);
    store.panBy(100, 50);
    const { zoom, panX, panY } = store.viewport();
    click(300 * zoom + panX, 200 * zoom + panY);

    expect(store.elements()[0]).toMatchObject({ type: 'DESK', position: { x: 300, y: 200 } });
  });

  it('shows the dragged rectangle as a preview', () => {
    store.chooseTool('ZONE');
    store.pointerDown({ x: 0, y: 0 });
    store.pointerMove({ x: 50, y: 40 });
    store.pointerMove({ x: 100, y: 80 });
    expect(store.preview()).toMatchObject({ shape: 'rectangle' });
    store.pointerUp({ x: 100, y: 80 });
    expect(store.elements()[0]).toMatchObject({ type: 'ZONE' });
  });

  it('adds a room only after its label is confirmed', () => {
    store.chooseTool('ROOM');
    store.pointerDown({ x: 0, y: 0 });
    store.pointerMove({ x: 100, y: 100 });
    store.pointerUp({ x: 100, y: 100 });

    expect(store.pendingRoom()).toHaveLength(4);
    expect(store.elements()).toEqual([]);

    store.confirmRoom('  Meeting 1  ');
    expect(store.pendingRoom()).toBeNull();
    expect(store.elements()[0]).toMatchObject({ type: 'ROOM', label: 'Meeting 1' });
  });

  it('refuses an empty room label and discards on cancel', () => {
    store.chooseTool('ROOM');
    store.pointerDown({ x: 0, y: 0 });
    store.pointerMove({ x: 100, y: 100 });
    store.pointerUp({ x: 100, y: 100 });

    store.confirmRoom('   ');
    expect(store.pendingRoom()).not.toBeNull();
    store.cancelRoom();
    expect(store.pendingRoom()).toBeNull();
    expect(store.elements()).toEqual([]);
  });

  it('ignores keys while the label dialog is open', () => {
    store.chooseTool('ROOM');
    store.pointerDown({ x: 0, y: 0 });
    store.pointerMove({ x: 100, y: 100 });
    store.pointerUp({ x: 100, y: 100 });
    store.keyDown('Escape');
    expect(store.tool()).toBe('ROOM');
  });

  it('keeps one desk when a double-click fires two clicks', () => {
    store.chooseTool('DESK');
    click(10, 10);
    click(10, 10, true);
    click(500, 10);
    expect(store.elements()).toHaveLength(2);
  });

  it('allows a second desk at the same coordinates when it is a separate click', () => {
    store.chooseTool('DESK');
    click(10, 10);
    click(10, 10);
    expect(store.elements()).toHaveLength(2);
  });

  it('drops a drag when the pointer is cancelled', () => {
    store.chooseTool('ZONE');
    store.pointerDown({ x: 0, y: 0 });
    store.pointerMove({ x: 100, y: 100 });
    store.pointerCancel();
    store.pointerMove({ x: 200, y: 200 });
    expect(store.preview()).toBeNull();
    expect(store.elements()).toEqual([]);
  });

  it('places decorative elements of the chosen kind', () => {
    store.chooseDecor('PLANT');
    click(10, 10);
    expect(store.tool()).toBe('DECOR');
    expect(store.elements()[0]).toMatchObject({ type: 'DECOR', kind: 'PLANT' });
  });

  it('selects the element under the click and deletes it with Delete', () => {
    store.chooseTool('DESK');
    click(100, 100);
    store.chooseTool('SELECT');
    click(100, 100);
    expect([...store.selectedIds()]).toEqual([store.elements()[0].id]);

    store.keyDown('Delete');
    expect(store.elements()).toEqual([]);
    expect(store.selectedIds().size).toBe(0);
  });

  it('clears the selection on empty space and when the tool changes', () => {
    store.chooseTool('DESK');
    click(100, 100);
    store.chooseTool('SELECT');
    click(100, 100);
    click(900, 900);
    expect(store.selectedIds().size).toBe(0);
    click(100, 100);
    store.chooseTool('WALL');
    expect(store.selectedIds().size).toBe(0);
  });

  it('Escape cancels a drawing in progress', () => {
    store.chooseTool('WALL');
    click(0, 0);
    click(50, 0);
    store.keyDown('Escape');
    expect(store.preview()).toBeNull();
    expect(store.elements()).toEqual([]);
  });

  it('finishes a polygon zone on double-click', () => {
    store.chooseTool('ZONE');
    click(0, 0);
    click(100, 0);
    click(100, 100);
    click(100, 100);
    store.doubleClick();
    expect(store.elements()[0]).toMatchObject({ type: 'ZONE' });
  });

  describe('editing existing elements', () => {
    const place = (kind: 'DESK' | 'PLANT', x: number, y: number) => {
      if (kind === 'DESK') store.chooseTool('DESK');
      else store.chooseDecor('PLANT');
      click(x, y);
      store.chooseTool('SELECT');
    };
    const drag = (from: [number, number], to: [number, number], shift = false) => {
      store.pointerDown({ x: from[0], y: from[1] }, shift);
      store.pointerMove({ x: (from[0] + to[0]) / 2, y: (from[1] + to[1]) / 2 }, shift);
      store.pointerMove({ x: to[0], y: to[1] }, shift);
      store.pointerUp({ x: to[0], y: to[1] }, false);
    };
    const desk = (index = 0) => store.elements()[index] as Extract<PlanElement, { type: 'DESK' }>;

    it('moves the element under the pointer by dragging, as one undo step', () => {
      place('DESK', 200, 200);
      drag([200, 200], [300, 260]);
      expect(desk().position).toEqual({ x: 300, y: 260 });
      store.undo();
      expect(desk().position).toEqual({ x: 200, y: 200 });
    });

    it('does not move anything, or record a step, for a plain click', () => {
      place('DESK', 200, 200);
      store.undo(); // removes the placement; redo it to have a clean history
      store.redo();
      click(200, 200);
      expect(desk().position).toEqual({ x: 200, y: 200 });
      store.undo();
      expect(store.elements()).toEqual([]);
    });

    it('moves every selected element together, and deletes them together', () => {
      place('DESK', 100, 100);
      place('PLANT', 500, 100);
      drag([0, 300], [700, 0]); // box around both
      expect(store.selectedIds().size).toBe(2);

      drag([100, 100], [150, 140]);
      expect(store.elements().map((e) => (e as PlacedLike).position)).toEqual([
        { x: 150, y: 140 },
        { x: 550, y: 140 },
      ]);
      store.undo();
      expect(store.elements().map((e) => (e as PlacedLike).position)).toEqual([
        { x: 100, y: 100 },
        { x: 500, y: 100 },
      ]);

      store.keyDown('Delete');
      expect(store.elements()).toEqual([]);
      store.undo();
      expect(store.elements()).toHaveLength(2);
    });

    it('extends and toggles the selection with Shift', () => {
      place('DESK', 100, 100);
      place('PLANT', 500, 100);
      click(100, 100);
      store.pointerDown({ x: 500, y: 100 }, true);
      store.pointerUp({ x: 500, y: 100 });
      expect(store.selectedIds().size).toBe(2);
      store.pointerDown({ x: 500, y: 100 }, true);
      store.pointerUp({ x: 500, y: 100 });
      expect(store.selectedIds().size).toBe(1);
    });

    it('selects only what lies fully inside the dragged box', () => {
      store.chooseTool('ZONE');
      store.pointerDown({ x: 0, y: 0 });
      store.pointerMove({ x: 1000, y: 800 });
      store.pointerUp({ x: 1000, y: 800 });
      place('DESK', 200, 200);
      drag([100, 100], [320, 300]);
      expect(store.selectedIds().size).toBe(1);
      expect(store.elements()[1].type).toBe('DESK');
      expect(store.selectedIds().has(store.elements()[1].id)).toBe(true);
    });

    it('selects a zone on click, and moves it only once it is selected', () => {
      store.chooseTool('ZONE');
      store.pointerDown({ x: 0, y: 0 });
      store.pointerMove({ x: 500, y: 400 });
      store.pointerUp({ x: 500, y: 400 });
      store.chooseTool('SELECT');
      const points = () => (store.elements()[0] as unknown as { points: { x: number }[] }).points.map((p) => p.x);

      drag([250, 200], [300, 200]); // unselected: draws a box, moves nothing
      expect(points()).toEqual([0, 500, 500, 0]);
      expect(store.selectedIds().size).toBe(0);

      click(250, 200);
      expect(store.selectedIds().size).toBe(1);
      drag([250, 200], [300, 200]);
      expect(points()).toEqual([50, 550, 550, 50]);
    });

    it('shows a box while dragging and none afterwards', () => {
      place('DESK', 200, 200);
      store.pointerDown({ x: 0, y: 0 });
      store.pointerMove({ x: 50, y: 50 });
      store.pointerMove({ x: 100, y: 100 });
      expect(store.marquee()).toHaveLength(4);
      store.pointerUp({ x: 100, y: 100 });
      expect(store.marquee()).toBeNull();
    });

    it('resizes with a corner handle, keeping the opposite corner fixed', () => {
      place('DESK', 200, 200); // 140 x 70: corners (130,165) .. (270,235)
      click(200, 200);
      drag([270, 235], [370, 335]);
      expect(desk()).toMatchObject({ position: { x: 250, y: 250 }, width: 240, height: 170 });
      store.undo();
      expect(desk()).toMatchObject({ position: { x: 200, y: 200 }, width: 140, height: 70 });
    });

    it('never resizes below the minimum size', () => {
      place('DESK', 200, 200);
      click(200, 200);
      drag([270, 235], [0, 0]);
      expect(desk().width).toBeGreaterThanOrEqual(10);
      expect(desk().height).toBeGreaterThanOrEqual(10);
    });

    it('rotates with the rotate handle and snaps to 15 degrees while Shift is held', () => {
      place('DESK', 200, 200);
      click(200, 200);
      const handle = store.overlay()!.rotate!.at; // straight above the center
      drag([handle.x, handle.y], [300, 200]); // a quarter turn clockwise
      expect(desk().rotation).toBe(90);

      store.undo();
      drag([handle.x, handle.y], [300, 170], true); // about 73 degrees off, snapped
      expect(desk().rotation % 15).toBe(0);
      expect(desk().rotation).toBe(75);
    });

    it('can rotate desks but offers no rotate handle for walls', () => {
      place('DESK', 200, 200);
      click(200, 200);
      expect(store.overlay()?.rotate).not.toBeNull();
      store.chooseTool('WALL');
      click(0, 500);
      click(300, 500);
      store.keyDown('Enter');
      store.chooseTool('SELECT');
      click(150, 500);
      expect(store.overlay()?.rotate).toBeNull();
      expect(store.properties()?.angle).toBeNull();
    });

    it('edits position, size and angle from the properties and records each edit', () => {
      place('DESK', 200, 200);
      click(200, 200);
      store.editSelected({ field: 'x', value: 400 });
      store.editSelected({ field: 'width', value: 300 });
      store.editSelected({ field: 'angle', value: 450 });
      expect(desk()).toMatchObject({ position: { x: 400, y: 200 }, width: 300, rotation: 90 });
      store.undo();
      expect(desk().rotation).toBe(0);
      store.undo();
      expect(desk().width).toBe(140);
      store.redo();
      expect(desk().width).toBe(300);
    });

    it('ignores a property edit that changes nothing or is not a number', () => {
      place('DESK', 200, 200);
      click(200, 200);
      store.editSelected({ field: 'x', value: 200 });
      store.editSelected({ field: 'y', value: Number.NaN });
      store.undo();
      expect(store.elements()).toEqual([]); // the only step left was the placement
    });

    it('scales and moves a wall from the properties', () => {
      store.chooseTool('WALL');
      click(100, 100);
      click(300, 100);
      store.keyDown('Enter');
      store.chooseTool('SELECT');
      click(200, 100);
      expect(store.properties()).toMatchObject({ x: 200, y: 100, width: 200, height: 0 });
      store.editSelected({ field: 'width', value: 400 });
      store.editSelected({ field: 'y', value: 150 });
      expect((store.elements()[0] as unknown as { points: unknown }).points).toEqual([
        { x: 0, y: 150 },
        { x: 400, y: 150 },
      ]);
    });

    it('shows no properties for several elements', () => {
      place('DESK', 100, 100);
      place('PLANT', 500, 100);
      drag([0, 300], [700, 0]);
      expect(store.properties()).toBeNull();
    });

    it('copies and pastes with an offset, selects the copies and gives them new ids', () => {
      place('DESK', 200, 200);
      click(200, 200);
      const originalId = store.elements()[0].id;
      store.copySelection();
      store.paste();

      expect(store.elements()).toHaveLength(2);
      const copy = desk(1);
      expect(copy.id).not.toBe(originalId);
      expect(copy.position).toEqual({ x: 300, y: 300 });
      expect([...store.selectedIds()]).toEqual([copy.id]);

      store.paste();
      expect(desk(2).position).toEqual({ x: 400, y: 400 });
      store.undo();
      store.undo();
      expect(store.elements()).toHaveLength(1);
    });

    it('pastes only the geometry of a desk, so it carries nothing of the original to link to', () => {
      place('DESK', 200, 200);
      click(200, 200);
      // a later feature may attach a resource to a desk; the copy must not inherit it
      const withResource = { ...store.elements()[0], resourceId: 'r-1' } as unknown as PlanElement;
      expect(Object.keys(copyOf(withResource, 'new', 0, 0)).sort()).toEqual(
        ['height', 'id', 'position', 'rotation', 'type', 'width'],
      );
    });

    it('pastes several copied elements together', () => {
      place('DESK', 100, 100);
      place('PLANT', 500, 100);
      drag([0, 300], [700, 0]);
      store.copySelection();
      store.paste();
      expect(store.elements()).toHaveLength(4);
      expect(store.selectedIds().size).toBe(2);
    });

    it('does nothing when pasting with an empty clipboard or copying an empty selection', () => {
      store.copySelection();
      store.paste();
      expect(store.elements()).toEqual([]);
      expect(store.canUndo()).toBe(false);
    });

    it('undoes and redoes create, delete and paste, and a new change drops the redo branch', () => {
      place('DESK', 100, 100);
      click(100, 100);
      store.deleteSelection();
      expect(store.elements()).toEqual([]);
      store.undo();
      expect(store.elements()).toHaveLength(1);
      store.redo();
      expect(store.elements()).toEqual([]);
      store.undo();
      store.undo();
      expect(store.elements()).toEqual([]);
      expect(store.canRedo()).toBe(true);
      place('PLANT', 50, 50);
      expect(store.canRedo()).toBe(false);
    });

    it('keeps at least 50 steps of history', () => {
      store.chooseTool('DESK');
      for (let i = 0; i < 60; i++) click(i * 200, 0);
      for (let i = 0; i < 60; i++) store.undo();
      expect(store.elements()).toEqual([]); // all 60 steps could be undone
      for (let i = 0; i < 60; i++) store.redo();
      expect(store.elements()).toHaveLength(60);
    });

    it('drops selected ids that no longer exist after undo', () => {
      place('DESK', 100, 100);
      click(100, 100);
      store.copySelection();
      store.paste();
      expect(store.selectedIds().size).toBe(1);
      store.undo();
      expect(store.selectedIds().size).toBe(0);
    });

    it('Escape abandons a drag and puts everything back, then clears the selection', () => {
      place('DESK', 200, 200);
      store.pointerDown({ x: 200, y: 200 });
      store.pointerMove({ x: 250, y: 250 });
      store.pointerMove({ x: 300, y: 300 });
      store.keyDown('Escape');
      expect(desk().position).toEqual({ x: 200, y: 200 });
      store.pointerUp({ x: 300, y: 300 });
      expect(desk().position).toEqual({ x: 200, y: 200 });
      store.keyDown('Escape');
      expect(store.selectedIds().size).toBe(0);
    });

    it('records no undo step for a drag that ends where it started', () => {
      place('DESK', 200, 200);
      drag([200, 200], [300, 260]);
      store.undo();
      store.redo();
      store.undo();
      store.redo();
      drag([200, 200], [300, 260]); // moves it again to a new spot...
      expect(store.canRedo()).toBe(false);
      store.pointerDown({ x: 400, y: 320 });
      store.pointerMove({ x: 450, y: 350 });
      store.pointerMove({ x: 400, y: 320 }); // ...and back
      store.pointerUp({ x: 400, y: 320 });
      store.undo(); // undoes the real move, not a phantom one
      expect(desk().position).toEqual({ x: 200, y: 200 });
    });

    it('keeps a redo branch when a drag changed nothing', () => {
      place('DESK', 200, 200);
      store.undo();
      expect(store.canRedo()).toBe(true);
      click(900, 900);
      expect(store.canRedo()).toBe(true);
    });

    it('Delete during a drag drops the drag first, so undo stays consistent', () => {
      place('DESK', 200, 200);
      store.pointerDown({ x: 200, y: 200 });
      store.pointerMove({ x: 250, y: 250 });
      store.pointerMove({ x: 300, y: 300 });
      store.keyDown('Delete');
      store.pointerUp({ x: 300, y: 300 });
      expect(store.elements()).toEqual([]);
      store.undo();
      expect(desk().position).toEqual({ x: 200, y: 200 }); // restored where it was, not mid-drag
    });

    it('a property edit during a drag drops the drag first', () => {
      place('DESK', 200, 200);
      store.pointerDown({ x: 200, y: 200 });
      store.pointerMove({ x: 250, y: 250 });
      store.pointerMove({ x: 300, y: 300 });
      store.editSelected({ field: 'width', value: 300 });
      store.pointerUp({ x: 300, y: 300 });
      expect(desk()).toMatchObject({ position: { x: 200, y: 200 }, width: 300 });
      store.undo();
      expect(desk()).toMatchObject({ position: { x: 200, y: 200 }, width: 140 });
    });

    it('a second press while a drag is live puts the plan back before starting the new gesture', () => {
      place('DESK', 200, 200);
      store.pointerDown({ x: 200, y: 200 });
      store.pointerMove({ x: 250, y: 250 });
      store.pointerMove({ x: 300, y: 300 });
      store.pointerDown({ x: 200, y: 200 }); // pointer-up was lost
      store.pointerUp({ x: 200, y: 200 });
      expect(desk().position).toEqual({ x: 200, y: 200 });
      expect(store.canUndo()).toBe(true); // only the placement
      store.undo();
      expect(store.elements()).toEqual([]);
    });

    it('reports whether history and clipboard actions did anything', () => {
      expect(store.undo()).toBe(false);
      expect(store.redo()).toBe(false);
      expect(store.copySelection()).toBe(false);
      expect(store.paste()).toBe(false);
      place('DESK', 100, 100);
      expect(store.undo()).toBe(true);
      expect(store.redo()).toBe(true);
      click(100, 100);
      expect(store.copySelection()).toBe(true);
      expect(store.paste()).toBe(true);
    });

    it('leaves history and paste alone while a shape is half drawn', () => {
      place('DESK', 100, 100);
      click(100, 100);
      store.copySelection();
      store.chooseTool('WALL');
      click(0, 500);
      expect(store.drawingInProgress()).toBe(true);
      expect(store.undo()).toBe(false);
      expect(store.paste()).toBe(false);
      expect(store.elements()).toHaveLength(1);
      store.keyDown('Escape');
      expect(store.undo()).toBe(true);
    });

    it('moving does not change the size or angle of an element', () => {
      place('DESK', 200, 200);
      click(200, 200);
      store.editSelected({ field: 'angle', value: 33.33 });
      drag([200, 200], [260, 240]);
      expect(desk()).toMatchObject({ width: 140, height: 70, rotation: 33.33 });
    });

    it('does not undo while the room dialog is open', () => {
      place('DESK', 100, 100);
      store.chooseTool('ROOM');
      store.pointerDown({ x: 300, y: 300 });
      store.pointerMove({ x: 400, y: 400 });
      store.pointerUp({ x: 400, y: 400 });
      store.undo();
      expect(store.elements()).toHaveLength(1);
    });
  });

  describe('grid, snapping and view', () => {
    it('has a 50 cm grid, and snapping can be switched on and off', () => {
      expect(store.gridSize()).toBe(50);
      expect(store.snapEnabled()).toBe(false); // beforeEach switched the default (on) off
      store.toggleSnap();
      expect(store.snapEnabled()).toBe(true);
    });

    it('snaps drawn points to the grid and leaves them free when snapping is off', () => {
      store.toggleSnap(); // beforeEach switched it off; back on
      store.chooseTool('DESK');
      click(130, 74);
      expect(store.elements()[0]).toMatchObject({ position: { x: 150, y: 50 } });

      store.toggleSnap();
      click(130, 74);
      expect(store.elements()[1]).toMatchObject({ position: { x: 130, y: 74 } });
    });

    it('follows the chosen grid size and refuses sizes that are not offered', () => {
      store.toggleSnap();
      store.setGridSize(100);
      store.chooseTool('DESK');
      click(130, 74);
      expect(store.elements()[0]).toMatchObject({ position: { x: 100, y: 100 } });

      store.setGridSize(33);
      expect(store.gridSize()).toBe(100);
    });

    it('snaps the top-left corner of a moved element to the grid', () => {
      store.chooseTool('DESK');
      click(70, 35); // desk 140 x 70 centred here: top-left corner at (0, 0)
      store.chooseTool('SELECT');
      store.toggleSnap();
      store.pointerDown({ x: 70, y: 35 });
      store.pointerMove({ x: 100, y: 60 });
      store.pointerMove({ x: 130, y: 90 }); // raw move of (60, 55): corner would land on (60, 55)
      store.pointerUp({ x: 130, y: 90 });

      const [desk] = store.elements();
      expect(desk).toMatchObject({ type: 'DESK', position: { x: 120, y: 85 } }); // corner on (50, 50)
    });

    it('moves freely when snapping is off', () => {
      store.chooseTool('DESK');
      click(70, 35);
      store.chooseTool('SELECT');
      store.pointerDown({ x: 70, y: 35 });
      store.pointerMove({ x: 100, y: 60 });
      store.pointerMove({ x: 130, y: 90 });
      store.pointerUp({ x: 130, y: 90 });

      expect(store.elements()[0]).toMatchObject({ position: { x: 130, y: 90 } });
    });

    it('zooms about the middle of the canvas for the zoom buttons', () => {
      const before = store.viewport();
      store.zoomStep(2, 800, 600);
      const after = store.viewport();
      expect(after.zoom).toBeCloseTo(before.zoom * 2, 10);
      // The plan point under the canvas centre does not move.
      const plan = { x: (400 - before.panX) / before.zoom, y: (300 - before.panY) / before.zoom };
      expect(plan.x * after.zoom + after.panX).toBeCloseTo(400, 6);
      expect(plan.y * after.zoom + after.panY).toBeCloseTo(300, 6);
    });

    it('fits the whole plan into the canvas, and returns to the starting view when the plan is empty', () => {
      store.toggleSnap();
      store.chooseTool('DESK');
      click(0, 0);
      click(2000, 1000);
      store.fitToScreen(800, 600);

      const { zoom, panX, panY } = store.viewport();
      const left = -70 * zoom + panX; // desks are 140 wide, centred on the click
      const right = 2070 * zoom + panX;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(800);
      expect((left + right) / 2).toBeCloseTo(400, 6);
    });

    it('returns to the starting view when fitting an empty plan', () => {
      store.zoomAt({ x: 0, y: 0 }, 3);
      store.fitToScreen(800, 600);
      expect(store.viewport()).toEqual(INITIAL_VIEWPORT);
    });
  });
});

interface PlacedLike {
  position: { x: number; y: number };
}
