/** Undo/redo as immutable snapshots: cheap, because plan elements are never mutated in place. */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

/** Steps kept for undo. The requirement is 50; the oldest step is dropped beyond this. */
export const HISTORY_LIMIT = 100;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/** Replaces the present without recording a step, for the live frames of a drag. */
export const setPresent = <T>(history: History<T>, present: T): History<T> => ({ ...history, present });

/** Records `base` as one undo step and makes the present current; a new change drops the redo branch. */
export function commitFrom<T>(history: History<T>, base: T, limit = HISTORY_LIMIT): History<T> {
  if (Object.is(base, history.present)) return history;
  return { past: [...history.past, base].slice(-limit), present: history.present, future: [] };
}

/** One recorded change: `commitFrom` the current present. */
export function record<T>(history: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  return commitFrom(setPresent(history, next), history.present, limit);
}

export const canUndo = <T>(history: History<T>): boolean => history.past.length > 0;
export const canRedo = <T>(history: History<T>): boolean => history.future.length > 0;

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}
