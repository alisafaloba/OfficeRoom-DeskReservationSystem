import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestBackend } from '@app-testing/test-backend';
import { Login } from './login';

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('Login', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideTestBackend()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Submits the form, answers the login request with an error and returns the shown message. */
  async function failedLogin(status: number, body: object): Promise<string> {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const fill = (selector: string, value: string) => {
      const input = root.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    fill('#email', 'someone@example.com');
    fill('#password', 'Password123!');
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    await tick();
    http
      .expectOne((r) => r.method === 'POST' && r.url === '/api/v1/auth/login')
      .flush(body, { status, statusText: 'Error' });
    await tick();
    fixture.detectChanges();
    return root.querySelector('p.bg-red-50')?.textContent?.trim() ?? '';
  }

  it('tells a deactivated user to contact an administrator', async () => {
    expect(await failedLogin(403, { code: 'ACCOUNT_DEACTIVATED' })).toContain('deactivated');
  });

  it('keeps the generic message for wrong credentials', async () => {
    expect(await failedLogin(401, { code: 'INVALID_CREDENTIALS' })).toContain('incorrect');
  });
});
