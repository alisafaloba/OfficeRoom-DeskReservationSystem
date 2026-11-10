export type Shortcut = 'undo' | 'redo' | 'copy' | 'paste';

type KeyInfo = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** The editing shortcut a key press stands for: Ctrl (or Cmd) + Z, Y or Shift+Z, C and V. */
export function shortcutOf(event: KeyInfo): Shortcut | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  switch (event.key.toLowerCase()) {
    case 'z':
      return event.shiftKey ? 'redo' : 'undo';
    case 'y':
      return 'redo';
    case 'c':
      return 'copy';
    case 'v':
      return 'paste';
    default:
      return null;
  }
}

/** True while the user is typing: shortcuts must leave the key to the field (native text undo, copy, paste). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
