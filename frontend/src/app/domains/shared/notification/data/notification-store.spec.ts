import { TestBed } from '@angular/core/testing';
import { NotificationStore } from './notification-store';

describe('NotificationStore', () => {
  let store: NotificationStore;

  beforeEach(() => {
    store = TestBed.inject(NotificationStore);
  });

  it('starts without a message', () => {
    expect(store.message()).toBeNull();
  });

  it('shows a message', () => {
    store.show('Access denied');

    expect(store.message()).toBe('Access denied');
  });

  it('replaces the current message with a newer one', () => {
    store.show('first');
    store.show('second');

    expect(store.message()).toBe('second');
  });

  it('clears the message on dismiss', () => {
    store.show('Access denied');
    store.dismiss();

    expect(store.message()).toBeNull();
  });
});
