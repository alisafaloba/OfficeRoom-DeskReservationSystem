import { canRedo, canUndo, commitFrom, createHistory, HISTORY_LIMIT, record, redo, setPresent, undo } from './history';

describe('history', () => {
  it('undoes and redoes recorded changes in order', () => {
    let h = createHistory(0);
    h = record(h, 1);
    h = record(h, 2);
    expect(undo(h).present).toBe(1);
    expect(undo(undo(h)).present).toBe(0);
    expect(redo(undo(undo(h))).present).toBe(1);
  });

  it('does nothing at either end', () => {
    const h = createHistory(0);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('drops the redo branch on a new change', () => {
    let h = record(record(createHistory(0), 1), 2);
    h = record(undo(h), 9);
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe(1);
  });

  it('records a whole drag as one step', () => {
    let h = createHistory(0);
    const base = h.present;
    h = setPresent(setPresent(setPresent(h, 1), 2), 3);
    expect(canUndo(h)).toBe(false);
    h = commitFrom(h, base);
    expect(undo(h).present).toBe(0);
    expect(h.past).toHaveLength(1);
  });

  it('records nothing when the drag ended where it began', () => {
    const h = createHistory([1]);
    expect(commitFrom(setPresent(h, h.present), h.present).past).toEqual([]);
  });

  it('keeps no more than the limit, dropping the oldest', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = record(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    let steps = 0;
    while (canUndo(h)) {
      h = undo(h);
      steps++;
    }
    expect(steps).toBe(HISTORY_LIMIT);
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(50);
  });
});
