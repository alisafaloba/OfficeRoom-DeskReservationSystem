import { isTypingTarget, shortcutOf } from './shortcuts';

const key = (k: string, mods: Partial<KeyboardEventInit> = {}) =>
  shortcutOf({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('shortcuts', () => {
  it('maps Ctrl and Cmd combinations', () => {
    expect(key('z', { ctrlKey: true })).toBe('undo');
    expect(key('z', { metaKey: true })).toBe('undo');
    expect(key('y', { ctrlKey: true })).toBe('redo');
    expect(key('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(key('c', { ctrlKey: true })).toBe('copy');
    expect(key('v', { metaKey: true })).toBe('paste');
  });

  it('ignores keys without Ctrl or Cmd, and Alt combinations', () => {
    expect(key('z')).toBeNull();
    expect(key('v')).toBeNull();
    expect(key('z', { ctrlKey: true, altKey: true })).toBeNull();
    expect(key('x', { ctrlKey: true })).toBeNull();
  });

  it('recognises fields the user types in', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true);
    }
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
