import { TestBed } from '@angular/core/testing';
import { FloorBackground } from '@app/spaces/models/floor-background';
import { BackgroundPanel } from './background-panel';

const background: FloorBackground = {
  contentType: 'image/png',
  sizeBytes: 2 * 1024 * 1024,
  opacity: 40,
  cmPerPixel: 1.5,
  updatedAt: '2026-11-23T10:00:00Z',
};

function render(inputs: { background?: FloorBackground | null; opacity?: number; busy?: boolean; error?: string | null } = {}) {
  const fixture = TestBed.createComponent(BackgroundPanel);
  fixture.componentRef.setInput('background', inputs.background ?? null);
  fixture.componentRef.setInput('opacity', inputs.opacity ?? 40);
  fixture.componentRef.setInput('busy', inputs.busy ?? false);
  fixture.componentRef.setInput('error', inputs.error ?? null);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, panel: fixture.componentInstance };
}

const button = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

describe('BackgroundPanel', () => {
  it('offers an upload when the floor has no background, and no settings', () => {
    const { el } = render();

    expect(el.textContent).toContain('Upload plan');
    expect(el.textContent).toContain('up to 10 MB');
    expect(el.querySelector('#background-opacity')).toBeNull();
    expect(button(el, 'Remove image')).toBeUndefined();
  });

  it('accepts PNG, JPG and PDF in the file picker and emits the chosen file', () => {
    const { el, panel } = render();
    const input = el.querySelector<HTMLInputElement>('[data-testid="background-file"]')!;
    expect(input.accept).toContain('image/png');
    expect(input.accept).toContain('image/jpeg');
    expect(input.accept).toContain('application/pdf');

    const chosen: File[] = [];
    panel.fileChosen.subscribe((file) => chosen.push(file));
    const file = new File(['x'], 'plan.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));

    expect(chosen).toEqual([file]);
    expect(input.value).toBe('');
  });

  it('shows the file facts, opacity and scale of an existing background', () => {
    const { el } = render({ background, opacity: 40 });

    expect(el.textContent).toContain('Replace image');
    expect(el.textContent).toContain('PNG · 2.0 MB');
    expect(el.querySelector('[data-testid="background-opacity-value"]')?.textContent?.trim()).toBe('40%');
    expect(el.querySelector<HTMLInputElement>('#background-opacity')!.value).toBe('40');
    expect(el.querySelector<HTMLInputElement>('#background-scale')!.value).toBe('1.5');
  });

  it('offers opacity from 0 to 100, previewing while dragging and committing on release', () => {
    const { el, panel } = render({ background });
    const slider = el.querySelector<HTMLInputElement>('#background-opacity')!;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('100');

    const previews: number[] = [];
    const commits: number[] = [];
    panel.opacityPreviewed.subscribe((v) => previews.push(v));
    panel.opacityCommitted.subscribe((v) => commits.push(v));
    slider.value = '0';
    slider.dispatchEvent(new Event('input'));
    slider.value = '100';
    slider.dispatchEvent(new Event('input'));
    slider.dispatchEvent(new Event('change'));

    expect(previews).toEqual([0, 100]);
    expect(commits).toEqual([100]);
  });

  it('commits a scale the server accepts (0.01 to 100)', () => {
    const { el, panel } = render({ background });
    const scale = el.querySelector<HTMLInputElement>('#background-scale')!;
    const commits: number[] = [];
    panel.scaleCommitted.subscribe((v) => commits.push(v));

    for (const value of ['2.25', '0.01', '100']) {
      scale.value = value;
      scale.dispatchEvent(new Event('change'));
    }

    expect(commits).toEqual([2.25, 0.01, 100]);
    expect(scale.min).toBe('0.01');
    expect(scale.max).toBe('100');
  });

  it('refuses a scale outside 0.01 to 100, puts the saved one back and says why', () => {
    const { fixture, el, panel } = render({ background });
    const scale = el.querySelector<HTMLInputElement>('#background-scale')!;
    const commits: number[] = [];
    panel.scaleCommitted.subscribe((v) => commits.push(v));

    for (const value of ['150', '0', '0.001', '', 'abc']) {
      scale.value = value;
      scale.dispatchEvent(new Event('change'));
      expect(scale.value).toBe('1.5');
    }
    fixture.detectChanges();

    expect(commits).toEqual([]);
    expect(el.querySelector('#background-scale-error')?.textContent).toContain('between 0.01 and 100');
    expect(scale.getAttribute('aria-describedby')).toBe('background-scale-error');

    scale.value = '3';
    scale.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('#background-scale-error')).toBeNull();
  });

  it('asks once more before removing, and can be cancelled', async () => {
    const { fixture, el, panel } = render({ background });
    let removed = 0;
    panel.removed.subscribe(() => removed++);

    button(el, 'Remove image')!.click();
    fixture.detectChanges();
    const box = el.querySelector('[role="group"]');
    expect(box?.textContent).toContain('The stored file is deleted.');
    expect(box?.getAttribute('aria-labelledby')).toBe('background-remove-question');
    button(el, 'Cancel')!.click();
    fixture.detectChanges();
    expect(removed).toBe(0);

    button(el, 'Remove image')!.click();
    fixture.detectChanges();
    button(el, 'Remove')!.click();
    fixture.detectChanges();
    expect(removed).toBe(1);
    expect(button(el, 'Remove image')).toBeDefined();
  });

  it('keeps keyboard focus: on Cancel when the box opens, back on Remove image when it closes', async () => {
    const { fixture, el } = render({ background });
    document.body.appendChild(el);

    button(el, 'Remove image')!.focus();
    button(el, 'Remove image')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(button(el, 'Cancel'));

    button(el, 'Cancel')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(button(el, 'Remove image'));
    el.remove();
  });

  it('disables the picker while uploading and shows errors', () => {
    const { el } = render({ busy: true, error: 'The image must be at most 10 MB.' });

    expect(el.textContent).toContain('Uploading…');
    expect(el.querySelector<HTMLInputElement>('[data-testid="background-file"]')!.disabled).toBe(true);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('at most 10 MB');
  });
});
