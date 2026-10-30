import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signInAs } from '@app-testing/sign-in';
import { provideTestBackend } from '@app-testing/test-backend';
import { Shell } from './shell';

describe('Shell navigation', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideTestBackend()] });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function navLinks(): string[] {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav[aria-label="Main"]');
    return Array.from(nav?.querySelectorAll('a') ?? [], (a) => a.getAttribute('href') ?? '');
  }

  it('shows the admin entry to admins', async () => {
    await signInAs('ADMIN');

    expect(navLinks()).toEqual(['/home', '/admin/users']);
  });

  it('hides the admin entry from employees', async () => {
    await signInAs('USER');

    expect(navLinks()).toEqual(['/home']);
  });

  it('shows no navigation entries to anonymous visitors', () => {
    expect(navLinks()).toEqual([]);
  });
});
