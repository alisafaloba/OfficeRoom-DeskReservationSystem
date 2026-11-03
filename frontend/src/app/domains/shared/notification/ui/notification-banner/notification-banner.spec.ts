import { TestBed } from '@angular/core/testing';
import { NotificationBanner } from './notification-banner';

describe('NotificationBanner', () => {
  function render(message: string) {
    const fixture = TestBed.createComponent(NotificationBanner);
    fixture.componentRef.setInput('message', message);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the message in a polite status region', () => {
    const element: HTMLElement = render('Access denied').nativeElement;

    const status = element.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toContain('Access denied');
  });

  it('emits dismissed when the close button is clicked', () => {
    const fixture = render('Access denied');
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => dismissed++);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')?.click();

    expect(dismissed).toBe(1);
  });

  it('labels the close button for screen readers', () => {
    const button = (render('Access denied').nativeElement as HTMLElement).querySelector('button');

    expect(button?.getAttribute('aria-label')).toBe('Dismiss');
  });
});
