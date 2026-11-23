import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideTestBackend } from '@app-testing/test-backend';
import { FloorBackground, MAX_BACKGROUND_BYTES } from '@app/spaces/models/floor-background';
import { PdfRasterizer } from '@app/spaces/util/pdf-rasterizer';
import { FloorBackgroundStore } from './floor-background-store';

const FLOOR_ID = 'f1';
const URL_ = `/api/v1/floors/${FLOOR_ID}/background`;

const settings = (over: Partial<FloorBackground> = {}): FloorBackground => ({
  contentType: 'image/png',
  sizeBytes: 1234,
  opacity: 50,
  cmPerPixel: 2,
  updatedAt: '2026-11-23T10:00:00Z',
  ...over,
});

/** A real PNG of the given size, so the store can measure it. */
async function png(width: number, height: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.fillRect(0, 0, 1, 1);
  return canvas.convertToBlob({ type: 'image/png' });
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

const notFound = { status: 404, statusText: 'Not Found' };

describe('FloorBackgroundStore', () => {
  let store: FloorBackgroundStore;
  let http: HttpTestingController;
  let rasterized: Blob[];

  beforeEach(() => {
    rasterized = [];
    TestBed.configureTestingModule({
      providers: [
        ...provideTestBackend(),
        FloorBackgroundStore,
        {
          provide: PdfRasterizer,
          useValue: {
            firstPage: async (pdf: Blob) => {
              rasterized.push(pdf);
              return png(40, 20);
            },
          },
        },
      ],
    });
    store = TestBed.inject(FloorBackgroundStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Loads a floor that has no background yet. */
  async function emptyFloor(): Promise<void> {
    const loading = store.load(FLOOR_ID);
    http.expectOne(URL_).flush({ code: 'FLOOR_BACKGROUND_NOT_FOUND' }, notFound);
    await loading;
  }

  it('loads the settings and the image, and sizes the layer in plan centimetres', async () => {
    const loading = store.load(FLOOR_ID);
    http.expectOne(URL_).flush(settings({ cmPerPixel: 2.5, opacity: 40 }));
    (await expectSoon(http, 'GET', `${URL_}/image`)).flush(await png(100, 60));
    await loading;

    const layer = store.layer();
    expect(layer).not.toBeNull();
    expect(layer!.width).toBe(250);
    expect(layer!.height).toBe(150);
    expect(layer!.opacity).toBeCloseTo(0.4);
    expect(layer!.url.startsWith('blob:')).toBe(true);
    expect(store.error()).toBeNull();
  });

  it('treats a floor without a background as empty, not as an error', async () => {
    await emptyFloor();

    expect(store.background()).toBeNull();
    expect(store.layer()).toBeNull();
    expect(store.error()).toBeNull();
  });

  it('reports a missing floor', async () => {
    const loading = store.load(FLOOR_ID);
    http.expectOne(URL_).flush({ code: 'FLOOR_NOT_FOUND' }, notFound);
    await loading;

    expect(store.error()).toBe('This floor no longer exists.');
  });

  it('uploads a PNG as multipart and shows it without downloading it again', async () => {
    await emptyFloor();
    const file = new File([await png(80, 40)], 'plan.png', { type: 'image/png' });

    const uploading = store.upload(file);
    expect(store.busy()).toBe(true);
    const request = await expectSoon(http, 'PUT');
    expect(request.request.body instanceof FormData).toBe(true);
    expect((request.request.body as FormData).get('file')).toBeInstanceOf(Blob);
    request.flush(settings({ cmPerPixel: 1 }));
    await uploading;

    expect(store.busy()).toBe(false);
    expect(store.layer()?.width).toBe(80);
    expect(store.layer()?.height).toBe(40);
  });

  it('turns a PDF into an image of its first page before uploading it', async () => {
    await emptyFloor();
    const pdf = new File(['%PDF-1.7'], 'ground-floor.pdf', { type: 'application/pdf' });

    const uploading = store.upload(pdf);
    const request = await expectSoon(http, 'PUT');
    const sent = (request.request.body as FormData).get('file') as File;
    expect(sent.name).toBe('ground-floor.png');
    expect(sent.type).toBe('image/png');
    request.flush(settings());
    await uploading;

    expect(rasterized).toEqual([pdf]);
    expect(store.layer()).not.toBeNull();
  });

  it('refuses other file types and files over 10 MB without contacting the server', async () => {
    await emptyFloor();

    await store.upload(new File(['GIF89a'], 'plan.gif', { type: 'image/gif' }));
    expect(store.error()).toBe('Choose a PNG, JPG or PDF file.');

    await store.upload(new File([new Uint8Array(MAX_BACKGROUND_BYTES + 1)], 'huge.png', { type: 'image/png' }));
    expect(store.error()).toBe('The image must be at most 10 MB.');
  });

  it('shows why the server refused a file', async () => {
    await emptyFloor();

    const uploading = store.upload(new File(['not really'], 'fake.png', { type: 'image/png' }));
    (await expectSoon(http, 'PUT')).flush({ code: 'UNSUPPORTED_IMAGE_TYPE' }, { status: 400, statusText: 'Bad Request' });
    await uploading;

    expect(store.error()).toBe('This file is not a PNG or JPG image.');
    expect(store.layer()).toBeNull();
  });

  describe('with an image', () => {
    beforeEach(async () => {
      const loading = store.load(FLOOR_ID);
      http.expectOne(URL_).flush(settings({ opacity: 50, cmPerPixel: 2 }));
      (await expectSoon(http, 'GET', `${URL_}/image`)).flush(await png(10, 10));
      await loading;
    });

    it('previews the opacity live and saves it with the current scale', async () => {
      store.previewOpacity(72.4);
      expect(store.layer()?.opacity).toBeCloseTo(0.72);

      const saving = store.saveSettings({ opacity: 72 });
      const request = http.expectOne((r) => r.method === 'PATCH');
      expect(request.request.body).toEqual({ opacity: 72, cmPerPixel: 2 });
      request.flush(settings({ opacity: 72, cmPerPixel: 2 }));
      await saving;

      expect(store.background()?.opacity).toBe(72);
    });

    it('rescales the layer when the scale is saved', async () => {
      const saving = store.saveSettings({ cmPerPixel: 5 });
      http.expectOne((r) => r.method === 'PATCH').flush(settings({ cmPerPixel: 5 }));
      await saving;

      expect(store.layer()?.width).toBe(50);
    });

    it('puts the saved values back when saving fails', async () => {
      store.previewOpacity(10);
      const saving = store.saveSettings({ opacity: 10 });
      http
        .expectOne((r) => r.method === 'PATCH')
        .flush({ code: 'VALIDATION_FAILED' }, { status: 400, statusText: 'Bad Request' });
      await saving;

      expect(store.opacity()).toBe(50);
      expect(store.error()).toContain('Opacity');
    });

    it('removes the image and forgets it', async () => {
      const removing = store.remove();
      http.expectOne((r) => r.method === 'DELETE' && r.url === URL_).flush(null, { status: 204, statusText: 'No Content' });
      await removing;

      expect(store.background()).toBeNull();
      expect(store.layer()).toBeNull();
    });
  });
});

/** Waits until the store has sent the request (it may first read or convert the file). */
async function expectSoon(http: HttpTestingController, method: string, url?: string) {
  for (let i = 0; i < 100; i++) {
    const found = http.match((r) => r.method === method && (url === undefined || r.url === url));
    if (found.length > 0) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}
