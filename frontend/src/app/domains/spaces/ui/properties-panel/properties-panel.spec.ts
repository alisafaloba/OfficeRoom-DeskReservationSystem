import { TestBed } from '@angular/core/testing';
import { PropertiesPanel } from './properties-panel';

function render(inputs: { zoomPercent?: number; snap?: boolean; gridSize?: number } = {}) {
  const fixture = TestBed.createComponent(PropertiesPanel);
  fixture.componentRef.setInput('zoomPercent', inputs.zoomPercent ?? 25);
  fixture.componentRef.setInput('snap', inputs.snap ?? true);
  fixture.componentRef.setInput('gridSize', inputs.gridSize ?? 50);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const button = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;

describe('PropertiesPanel', () => {
  it('asks for a selection when nothing is selected', () => {
    const { el } = render();
    expect(el.querySelector('[data-testid="properties-panel"]')).not.toBeNull();
    expect(el.querySelector('input[type="number"]')).toBeNull();
  });

  it('shows the zoom level and emits the zoom and fit actions', () => {
    const { fixture, el } = render({ zoomPercent: 125 });
    expect(el.querySelector('output')?.textContent?.trim()).toBe('125%');

    const events: string[] = [];
    fixture.componentInstance.zoomedIn.subscribe(() => events.push('in'));
    fixture.componentInstance.zoomedOut.subscribe(() => events.push('out'));
    fixture.componentInstance.fitted.subscribe(() => events.push('fit'));
    (el.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click();
    (el.querySelector('button[aria-label="Zoom out"]') as HTMLButtonElement).click();
    button(el, 'Fit to screen').click();
    expect(events).toEqual(['in', 'out', 'fit']);
  });

  it('shows whether snapping is on and emits the toggle', () => {
    const on = render({ snap: true });
    expect(button(on.el, 'Snap to grid').getAttribute('aria-pressed')).toBe('true');
    let toggled = 0;
    on.fixture.componentInstance.snapToggled.subscribe(() => toggled++);
    button(on.el, 'Snap to grid').click();
    expect(toggled).toBe(1);

    expect(button(render({ snap: false }).el, 'Snap to grid').getAttribute('aria-pressed')).toBe('false');
  });

  it('offers the grid sizes, selects the current one and emits a new choice', () => {
    const { fixture, el } = render({ gridSize: 25 });
    const select = el.querySelector('select')!;
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['10 cm', '25 cm', '50 cm', '100 cm']);
    expect(select.value).toBe('25');

    const chosen: number[] = [];
    fixture.componentInstance.gridSizeChosen.subscribe((s) => chosen.push(s));
    select.value = '100';
    select.dispatchEvent(new Event('change'));
    expect(chosen).toEqual([100]);
  });
});
