import { TestBed } from '@angular/core/testing';
import { INITIAL_VIEWPORT, MAX_ZOOM, planToScreen } from '@app/spaces/util/viewport';
import { FloorPlanEditorStore } from './floor-plan-editor-store';

describe('FloorPlanEditorStore', () => {
  let store: FloorPlanEditorStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FloorPlanEditorStore] });
    store = TestBed.inject(FloorPlanEditorStore);
    // zoom 1, no pan: screen coordinates equal plan coordinates
    store.zoomAt({ x: 0, y: 0 }, 1 / store.viewport().zoom);
    store.panBy(-store.viewport().panX, -store.viewport().panY);
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
    expect(store.selectedId()).toBe(store.elements()[0].id);

    store.keyDown('Delete');
    expect(store.elements()).toEqual([]);
    expect(store.selectedId()).toBeNull();
  });

  it('clears the selection on empty space and when the tool changes', () => {
    store.chooseTool('DESK');
    click(100, 100);
    store.chooseTool('SELECT');
    click(100, 100);
    click(900, 900);
    expect(store.selectedId()).toBeNull();
    click(100, 100);
    store.chooseTool('WALL');
    expect(store.selectedId()).toBeNull();
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

  describe('fitToScreen', () => {
    const drawWall = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      store.chooseTool('WALL');
      click(from.x, from.y);
      click(to.x, to.y);
      store.keyDown('Enter');
    };

    it('returns to the starting view for an empty plan', () => {
      store.zoomAt({ x: 0, y: 0 }, 3);
      store.fitToScreen(1000, 600);
      expect(store.viewport()).toEqual(INITIAL_VIEWPORT);
    });

    it('fits the whole plan and centres it in the canvas', () => {
      drawWall({ x: 0, y: 0 }, { x: 2000, y: 0 });
      drawWall({ x: 0, y: 1000 }, { x: 2000, y: 1000 });
      store.fitToScreen(1000, 600);

      const view = store.viewport();
      expect(view.zoom).toBeCloseTo(0.46, 10); // width is the limit: (1000 - 2 * 40) / 2000
      const middle = planToScreen(view, { x: 1000, y: 500 });
      expect(middle.x).toBeCloseTo(500, 10);
      expect(middle.y).toBeCloseTo(300, 10);
      const corner = planToScreen(view, { x: 2000, y: 1000 });
      expect(corner.x).toBeLessThanOrEqual(1000 - 40 + 1e-9);
      expect(corner.y).toBeLessThanOrEqual(600 - 40 + 1e-9);
    });

    it('does not zoom in past the maximum on a small plan', () => {
      store.chooseTool('DESK');
      click(500, 300);
      store.fitToScreen(1000, 600);

      expect(store.viewport().zoom).toBe(MAX_ZOOM);
      const desk = planToScreen(store.viewport(), { x: 500, y: 300 });
      expect(desk.x).toBeCloseTo(500, 10);
      expect(desk.y).toBeCloseTo(300, 10);
    });
  });

  describe('snap to grid', () => {
    it('is on by default and can be toggled', () => {
      expect(store.snapEnabled()).toBe(true);
      store.toggleSnap();
      expect(store.snapEnabled()).toBe(false);
      store.toggleSnap();
      expect(store.snapEnabled()).toBe(true);
    });

    it('snaps wall points to the grid', () => {
      store.chooseTool('WALL');
      click(70, 140);
      click(120, 10);
      store.keyDown('Enter');
      expect(store.elements()[0]).toMatchObject({
        type: 'WALL',
        points: [
          { x: 50, y: 150 },
          { x: 100, y: 0 },
        ],
      });
    });

    it('snaps a placed desk to the grid', () => {
      store.chooseTool('DESK');
      click(130, 480);
      expect(store.elements()[0]).toMatchObject({ type: 'DESK', position: { x: 150, y: 500 } });
    });

    it('keeps the exact position when snapping is off', () => {
      store.toggleSnap();
      store.chooseTool('DESK');
      click(130, 480);
      expect(store.elements()[0]).toMatchObject({ type: 'DESK', position: { x: 130, y: 480 } });
    });

    it('does not snap while selecting, so an element near its edge is still picked', () => {
      store.chooseTool('DESK');
      click(150, 500); // a desk is 70 high: it spans y 465..535
      store.chooseTool('SELECT');
      click(150, 538); // within the 4 px click tolerance; the nearest grid line (550) would miss
      expect(store.selectedId()).not.toBeNull();
    });
  });

  describe('view and grid settings', () => {
    it('zooms around the middle of the canvas for the zoom buttons', () => {
      store.zoomStep(2, 1000, 600);
      expect(store.viewport().zoom).toBe(2);
      const middle = planToScreen(store.viewport(), { x: 500, y: 300 });
      expect(middle.x).toBeCloseTo(500, 10);
      expect(middle.y).toBeCloseTo(300, 10);
    });

    it('keeps the zoom buttons inside the 10% - 400% range', () => {
      for (let i = 0; i < 50; i++) store.zoomStep(1.25, 1000, 600);
      expect(store.viewport().zoom).toBe(MAX_ZOOM);
      for (let i = 0; i < 80; i++) store.zoomStep(1 / 1.25, 1000, 600);
      expect(store.viewport().zoom).toBe(0.1);
    });

    it('starts with a 50 cm grid and snaps to the chosen size', () => {
      expect(store.gridSize()).toBe(50);
      store.setGridSize(25);
      expect(store.gridSize()).toBe(25);
      store.chooseTool('DESK');
      click(130, 480);
      expect(store.elements()[0]).toMatchObject({ position: { x: 125, y: 475 } });
    });

    it('ignores a grid size that is not on offer', () => {
      store.setGridSize(30);
      expect(store.gridSize()).toBe(50);
    });

    it('exposes the selected element and deletes it', () => {
      expect(store.selectedElement()).toBeNull();
      store.chooseTool('DESK');
      click(150, 500);
      store.chooseTool('SELECT');
      click(150, 500);
      expect(store.selectedElement()).toMatchObject({ type: 'DESK' });

      store.deleteSelected();
      expect(store.elements()).toEqual([]);
      expect(store.selectedElement()).toBeNull();
    });

    it('does nothing when deleting with no selection', () => {
      store.chooseTool('DESK');
      click(150, 500);
      store.deleteSelected();
      expect(store.elements()).toHaveLength(1);
    });
  });
});
