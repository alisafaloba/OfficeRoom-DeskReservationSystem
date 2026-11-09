import { TestBed } from '@angular/core/testing';
import { DecorKind } from '@app/spaces/models/floor-plan';
import { Tool } from '@app/spaces/util/drawing-machine';
import { DecorPalette } from './decor-palette';

function render(tool: Tool, kind: DecorKind) {
  const fixture = TestBed.createComponent(DecorPalette);
  fixture.componentRef.setInput('tool', tool);
  fixture.componentRef.setInput('kind', kind);
  fixture.detectChanges();
  return fixture;
}

describe('DecorPalette', () => {
  it('offers doors, windows, stairs, elevators and plants', () => {
    const buttons = Array.from((render('SELECT', 'DOOR').nativeElement as HTMLElement).querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Door', 'Window', 'Stairs', 'Elevator', 'Plant']);
  });

  it('presses only the chosen kind while the decor tool is active', () => {
    const el = render('DECOR', 'STAIRS').nativeElement as HTMLElement;
    const pressed = Array.from(el.querySelectorAll('button[aria-pressed="true"]'));
    expect(pressed.map((b) => b.textContent?.trim())).toEqual(['Stairs']);
  });

  it('presses nothing for another tool', () => {
    const el = render('WALL', 'STAIRS').nativeElement as HTMLElement;
    expect(el.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0);
  });

  it('emits the chosen kind', () => {
    const fixture = render('SELECT', 'DOOR');
    const chosen: DecorKind[] = [];
    fixture.componentInstance.kindChosen.subscribe((k) => chosen.push(k));
    const plant = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Plant',
    )!;
    plant.click();
    expect(chosen).toEqual(['PLANT']);
  });
});
