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
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  visible: true,
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
  let rasterized: { pdf: Blob; page: number }[];
  let pdfPages: number;

  beforeEach(() => {
    rasterized = [];
    pdfPages = 1;
    TestBed.configureTestingModule({
      providers: [
        ...provideTestBackend(),
        FloorBackgroundStore,
        {
          provide: PdfRasterizer,
          useValue: {
            pageCount: async () => pdfPages,
            page: async (pdf: Blob, page: number) => {
              rasterized.push({ pdf, page });
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

  it('drops a slow answer for a floor the editor already left, and clears the old image at once', async () => {
    const urlOf = (id: string) => `/api/v1/floors/${id}/background`;
    const loadingA = store.load('A');
    http.expectOne(urlOf('A')).flush(settings({ cmPerPixel: 1 }));
    const imageA = await expectSoon(http, 'GET', `${urlOf('A')}/image`);

    const loadingB = store.load('B');
    expect(store.layer()).toBeNull();
    http.expectOne(urlOf('B')).flush(settings({ cmPerPixel: 3 }));
    (await expectSoon(http, 'GET', `${urlOf('B')}/image`)).flush(await png(10, 10));
    await loadingB;
    expect(store.layer()?.width).toBe(30);

    imageA.flush(await png(500, 500));
    await loadingA;
    expect(store.layer()?.width).toBe(30);
    expect(store.background()?.cmPerPixel).toBe(3);
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

    expect(rasterized).toEqual([{ pdf, page: 1 }]);
    expect(store.layer()).not.toBeNull();
  });

  it('lets the admin pick the page of a multi-page PDF, and uploads only that page', async () => {
    await emptyFloor();
    pdfPages = 3;
    const pdf = new File(['%PDF-1.7'], 'building.pdf', { type: 'application/pdf' });

    await store.upload(pdf);
    expect(store.pdfChoice()).toEqual({ fileName: 'building.pdf', pages: 3 });
    http.expectNone((r) => r.method === 'PUT');

    const choosing = store.choosePdfPage(2);
    const request = await expectSoon(http, 'PUT');
    expect(((request.request.body as FormData).get('file') as File).name).toBe('building-page-2.png');
    request.flush(settings());
    await choosing;

    expect(rasterized).toEqual([{ pdf, page: 2 }]);
    expect(store.pdfChoice()).toBeNull();
  });

  it('drops a pending PDF choice on cancel, and ignores pages that do not exist', async () => {
    await emptyFloor();
    pdfPages = 2;
    await store.upload(new File(['%PDF-1.7'], 'plan.pdf', { type: 'application/pdf' }));

    await store.choosePdfPage(5);
    expect(store.pdfChoice()).not.toBeNull();
    store.cancelPdfChoice();
    expect(store.pdfChoice()).toBeNull();
    await store.choosePdfPage(1);
    http.expectNone((r) => r.method === 'PUT');
    expect(rasterized).toEqual([]);
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
      expect(request.request.body).toEqual({ opacity: 72, cmPerPixel: 2, offsetX: 0, offsetY: 0, rotation: 0, visible: true });
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

    it('refuses a scale outside 0.01 to 100 without contacting the server', async () => {
      await store.saveSettings({ cmPerPixel: 150 });
      await store.saveSettings({ cmPerPixel: 0.001 });

      http.expectNone((r) => r.method === 'PATCH');
      expect(store.error()).toBe('The scale must be between 0.01 and 100 cm per pixel.');
      expect(store.background()?.cmPerPixel).toBe(2);
    });

    it('saves the opacity once the slider rests, not on every step', async () => {
      for (const step of [51, 52, 53, 80]) store.commitOpacity(step);
      expect(store.layer()?.opacity).toBeCloseTo(0.8);
      http.expectNone((r) => r.method === 'PATCH');

      await new Promise((resolve) => setTimeout(resolve, 350));
      const request = http.expectOne((r) => r.method === 'PATCH');
      expect(request.request.body).toEqual({ opacity: 80, cmPerPixel: 2, offsetX: 0, offsetY: 0, rotation: 0, visible: true });
      request.flush(settings({ opacity: 80 }));
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

    it('hands out a new settings object after a failed save, so the fields show the saved values again', async () => {
      const before = store.background();
      const saving = store.saveSettings({ cmPerPixel: 7 });
      http
        .expectOne((r) => r.method === 'PATCH')
        .flush({ code: 'VALIDATION_FAILED' }, { status: 400, statusText: 'Bad Request' });
      await saving;

      expect(store.background()).not.toBe(before);
      expect(store.background()).toEqual(before);
    });

    const patch = () => http.expectOne((r) => r.method === 'PATCH');

    it('hides the image without deleting it, and shows it again', async () => {
      const hiding = store.toggleVisible();
      expect(store.layer()).toBeNull();
      const request = patch();
      expect(request.request.body.visible).toBe(false);
      request.flush(settings({ visible: false }));
      await hiding;
      expect(store.background()).not.toBeNull();
      expect(store.layer()).toBeNull();

      const showing = store.toggleVisible();
      patch().flush(settings({ visible: true }));
      await showing;
      expect(store.layer()).not.toBeNull();
    });

    it('turns the image in quarter turns, both ways, keeping its top-left corner', async () => {
      const right = store.rotate(1);
      const first = patch();
      expect(first.request.body.rotation).toBe(90);
      first.flush(settings({ rotation: 90 }));
      await right;

      const left = store.rotate(-1);
      const request = patch();
      expect(request.request.body.rotation).toBe(0);
      request.flush(settings());
      await left;

      const wrap = store.rotate(-1);
      const last = patch();
      expect(last.request.body.rotation).toBe(270);
      last.flush(settings({ rotation: 270 }));
      await wrap;
      expect(store.layer()).toMatchObject({ x: 0, y: 0, rotation: 270 });
    });

    it('places the image at a typed position and refuses one beyond 1 km', async () => {
      const moving = store.moveTo(120.25, -40);
      const request = patch();
      expect(request.request.body).toMatchObject({ offsetX: 120.3, offsetY: -40 });
      request.flush(settings({ offsetX: 120.3, offsetY: -40 }));
      await moving;
      expect(store.layer()).toMatchObject({ x: 120.3, y: -40 });

      await store.moveTo(100_001, 0);
      http.expectNone((r) => r.method === 'PATCH');
      expect(store.error()).toContain('1 km');
    });

    it('drags the image on the plan and saves where it ends up', async () => {
      store.toggleMoving();
      expect(store.mode()).toBe('moving');
      store.pointerDown({ x: 100, y: 100 });
      store.pointerMove({ x: 150, y: 80 });
      expect(store.layer()).toMatchObject({ x: 50, y: -20 });
      http.expectNone((r) => r.method === 'PATCH');

      store.pointerUp();
      const request = patch();
      expect(request.request.body).toMatchObject({ offsetX: 50, offsetY: -20 });
      request.flush(settings({ offsetX: 50, offsetY: -20 }));
      await new Promise((resolve) => setTimeout(resolve));
      expect(store.layer()).toMatchObject({ x: 50, y: -20 });
      expect(store.mode()).toBe('moving');

      store.toggleMoving();
      expect(store.mode()).toBe('idle');
    });

    it('puts a drag back when it is cancelled', () => {
      store.toggleMoving();
      store.pointerDown({ x: 0, y: 0 });
      store.pointerMove({ x: 500, y: 500 });
      store.cancelMode();

      expect(store.layer()).toMatchObject({ x: 0, y: 0 });
      http.expectNone((r) => r.method === 'PATCH');
    });

    it('calibrates the scale from two points and their real distance', async () => {
      // 10 x 10 px image at 2 cm/px: two points 20 cm apart on the plan are 10 image pixels apart.
      store.startCalibration();
      expect(store.mode()).toBe('calibrating');
      store.pointerDown({ x: 0, y: 0 });
      store.pointerMove({ x: 12, y: 16 });
      expect(store.calibrationMarks()).toEqual([{ x: 0, y: 0 }, { x: 12, y: 16 }]);
      expect(store.calibrationReady()).toBe(false);
      store.pointerDown({ x: 12, y: 16 });
      expect(store.calibrationReady()).toBe(true);

      const finishing = store.finishCalibration(540);
      const request = patch();
      expect(request.request.body.cmPerPixel).toBe(54);
      request.flush(settings({ cmPerPixel: 54 }));
      await finishing;

      expect(store.mode()).toBe('idle');
      expect(store.layer()?.width).toBe(540);
    });

    it('refuses a calibration that would leave the allowed scale', async () => {
      store.startCalibration();
      store.pointerDown({ x: 0, y: 0 });
      store.pointerDown({ x: 2, y: 0 }); // 1 image pixel
      await store.finishCalibration(500);

      http.expectNone((r) => r.method === 'PATCH');
      expect(store.error()).toContain('between 0.01 and 100');
      expect(store.mode()).toBe('idle');
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
