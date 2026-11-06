import { TestBed } from '@angular/core/testing';
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

  const click = (x: number, y: number) => {
    store.pointerDown({ x, y });
    store.pointerUp({ x, y });
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

  it('keeps one desk when a double-click fires two clicks at the same spot', () => {
    store.chooseTool('DESK');
    click(10, 10);
    click(10, 10);
    click(500, 10);
    expect(store.elements()).toHaveLength(2);
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
});
