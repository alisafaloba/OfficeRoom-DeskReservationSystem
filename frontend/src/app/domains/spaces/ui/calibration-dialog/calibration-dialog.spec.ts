import { TestBed } from '@angular/core/testing';
import { CalibrationDialog } from './calibration-dialog';

function render(measuredCm = 512) {
  const fixture = TestBed.createComponent(CalibrationDialog);
  fixture.componentRef.setInput('measuredCm', measuredCm);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector<HTMLInputElement>('#calibration-distance')!;
  const submit = () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  };
  return { fixture, el, input, submit, dialog: fixture.componentInstance };
}

describe('CalibrationDialog', () => {
  it('opens as a modal and shows the distance at the current scale', () => {
    const { el } = render(512);
    expect(el.querySelector('dialog')!.open).toBe(true);
    expect(el.textContent).toContain('5.12 m apart');
  });

  it('emits the real distance in centimetres, also with a decimal comma', () => {
    const { input, submit, dialog } = render();
    const confirmed: number[] = [];
    dialog.confirmed.subscribe((cm) => confirmed.push(cm));

    input.value = '5.40';
    submit();
    input.value = '12,5';
    submit();

    expect(confirmed).toEqual([540, 1250]);
  });

  it('refuses an empty, zero or non-numeric distance and says why', () => {
    const { el, input, submit, dialog } = render();
    const confirmed: number[] = [];
    dialog.confirmed.subscribe((cm) => confirmed.push(cm));

    for (const value of ['', '0', '-3', 'abc']) {
      input.value = value;
      submit();
    }

    expect(confirmed).toEqual([]);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('above 0');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('closes on Cancel', () => {
    const { el, dialog } = render();
    let closed = 0;
    dialog.closed.subscribe(() => closed++);
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancel')!.click();
    expect(closed).toBe(1);
  });
});
