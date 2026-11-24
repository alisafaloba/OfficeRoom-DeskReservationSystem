import { Injectable } from '@angular/core';
import { MAX_BACKGROUND_BYTES } from '@app/spaces/models/floor-background';

/** Pixels per PDF point: 2 renders an A4 page at 144 dpi, enough to read room labels. */
const RENDER_SCALE = 2;
/** Longest side of the rendered page; keeps the image well under the upload limit. */
const MAX_SIDE_PX = 5000;

/**
 * Turns a page of a PDF into an image in the browser, so the server only ever stores
 * PNG or JPEG. pdf.js is loaded on first use only: it is large and most visits never need it.
 * Its worker script is copied next to index.html by angular.json.
 *
 * pdf.js 6 has no eval-based code path any more (the one behind CVE-2024-4367 and the old
 * `isEvalSupported` option); keep `pdfjs-dist` updated, since it parses files from users.
 */
@Injectable({ providedIn: 'root' })
export class PdfRasterizer {
  /** How many pages the PDF has, so the admin can pick one when there are several. */
  async pageCount(pdf: Blob): Promise<number> {
    const task = await open(pdf);
    try {
      return (await task.promise).numPages;
    } finally {
      await task.destroy();
    }
  }

  /** The given page (1-based) as an image. */
  async page(pdf: Blob, pageNumber = 1): Promise<Blob> {
    const task = await open(pdf);
    try {
      const pdfDocument = await task.promise;
      const page = await pdfDocument.getPage(pageNumber);
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.min(RENDER_SCALE, MAX_SIDE_PX / Math.max(natural.width, natural.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport, background: 'white' }).promise;
      return await toBlob(canvas);
    } finally {
      await task.destroy();
    }
  }
}

async function open(pdf: Blob) {
  const pdfjs = await import('pdfjs-dist');
  // Relative to the document, so the app also works when served under a sub-path.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href;
  return pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) });
}

/** PNG keeps line drawings sharp; a scan that would not fit as PNG falls back to JPEG. */
async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const encode = (type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the page'))), type, quality),
    );
  const png = await encode('image/png');
  return png.size <= MAX_BACKGROUND_BYTES ? png : encode('image/jpeg', 0.9);
}
