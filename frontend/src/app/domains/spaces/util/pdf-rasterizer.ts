import { Injectable } from '@angular/core';

/** Pixels per PDF point: 2 renders an A4 page at 144 dpi, enough to read room labels. */
const RENDER_SCALE = 2;
/** Longest side of the rendered page; keeps the image well under the upload limit. */
const MAX_SIDE_PX = 5000;

/**
 * Turns the first page of a PDF into an image in the browser, so the server only ever stores
 * PNG or JPEG. pdf.js is loaded on first use only: it is large and most visits never need it.
 * Its worker script is copied to the site root by angular.json.
 */
@Injectable({ providedIn: 'root' })
export class PdfRasterizer {
  async firstPage(pdf: Blob): Promise<Blob> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
    try {
      const document = await task.promise;
      const page = await document.getPage(1);
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.min(RENDER_SCALE, MAX_SIDE_PX / Math.max(natural.width, natural.height));
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: 'white' }).promise;
      return await toBlob(canvas);
    } finally {
      await task.destroy();
    }
  }
}

/** PNG keeps line drawings sharp; a scan that would not fit as PNG falls back to JPEG. */
async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const encode = (type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the page'))), type, quality),
    );
  const png = await encode('image/png');
  return png.size <= 10 * 1024 * 1024 ? png : encode('image/jpeg', 0.9);
}
