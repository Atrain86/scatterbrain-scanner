// Receipt auto-crop and perspective correction using jscanify + OpenCV.js

declare const cv: any;

let scannerInstance: any = null;

function waitForOpenCV(timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof cv !== 'undefined' && cv.Mat) { resolve(); return; }
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 100;
      if (typeof cv !== 'undefined' && cv.Mat) {
        clearInterval(interval);
        resolve();
      } else if (elapsed >= timeoutMs) {
        clearInterval(interval);
        reject(new Error('OpenCV timed out'));
      }
    }, 100);
  });
}

function getScanner() {
  if (!scannerInstance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jscanify = require('jscanify');
    scannerInstance = new jscanify();
  }
  return scannerInstance;
}

function imageToCanvas(source: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  if (source instanceof HTMLCanvasElement) return source;
  const canvas = document.createElement('canvas');
  canvas.width  = source.naturalWidth  || source.width;
  canvas.height = source.naturalHeight || source.height;
  canvas.getContext('2d')?.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Auto-crop and perspective-correct a receipt image.
 * Falls back to the original image if detection fails.
 */
export async function processReceiptImage(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<HTMLCanvasElement> {
  try {
    await waitForOpenCV();
    const scanner = getScanner();
    const result  = scanner.extractPaper(source) as HTMLCanvasElement;
    if (result && result.width > 50 && result.height > 50) return result;
    return imageToCanvas(source);
  } catch {
    return imageToCanvas(source);
  }
}

/**
 * Returns a canvas with detected receipt edges highlighted (green overlay).
 * Used for the optional preview step.
 */
export async function highlightReceiptEdges(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<HTMLCanvasElement> {
  try {
    await waitForOpenCV();
    const scanner = getScanner();
    return scanner.highlightPaper(source) as HTMLCanvasElement;
  } catch {
    return imageToCanvas(source);
  }
}

export function isScannerAvailable(): boolean {
  try { return typeof cv !== 'undefined' && !!cv.Mat; } catch { return false; }
}

/** Convert a canvas to a File for upload */
export function canvasToFile(canvas: HTMLCanvasElement, filename: string, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
      resolve(new File([blob], filename, { type: 'image/jpeg', lastModified: Date.now() }));
    }, 'image/jpeg', quality);
  });
}
