/**
 * autoCrop.ts — luminance-based edge detection for receipt images.
 *
 * Receipts are bright (white paper). Backgrounds are typically dark (tables,
 * hands, shadows). We find the crop boundary by locating rows/columns where
 * a meaningful fraction of pixels exceed a luminance threshold.
 *
 * Returns { croppedDataUrl, croppedBlob, degenerate, debugInfo }.
 * degenerate = true when cropped area < 50% of original OR either dimension
 * < 300px. When degenerate the original file is returned unchanged.
 */

const LUMA_THRESHOLD = 140; // 0-255; white paper ~200+, dark backgrounds ~40-100
const CONTENT_RATIO  = 0.05; // 5% of row/col pixels must be bright to count as content

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export interface AutoCropResult {
  croppedDataUrl: string;
  croppedBlob: Blob;
  degenerate: boolean;
  debugInfo: string;
}

export async function autoCrop(file: File): Promise<AutoCropResult> {
  const imageBitmap = await createImageBitmap(file);
  const { width, height } = imageBitmap;

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('autoCrop: could not get 2d context');

  ctx.drawImage(imageBitmap, 0, 0);
  imageBitmap.close();

  const { data } = ctx.getImageData(0, 0, width, height);

  function pixelIsBright(x: number, y: number): boolean {
    const i = (y * width + x) * 4;
    return luma(data[i], data[i + 1], data[i + 2]) > LUMA_THRESHOLD;
  }

  function rowHasContent(y: number): boolean {
    const needed = Math.ceil(width * CONTENT_RATIO);
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (pixelIsBright(x, y) && ++count >= needed) return true;
    }
    return false;
  }

  function colHasContent(x: number): boolean {
    const needed = Math.ceil(height * CONTENT_RATIO);
    let count = 0;
    for (let y = 0; y < height; y++) {
      if (pixelIsBright(x, y) && ++count >= needed) return true;
    }
    return false;
  }

  let top    = 0;
  let bottom = height - 1;
  let left   = 0;
  let right  = width - 1;

  for (let y = 0; y < height; y++)      { if (rowHasContent(y)) { top    = y; break; } }
  for (let y = height - 1; y >= 0; y--) { if (rowHasContent(y)) { bottom = y; break; } }
  for (let x = 0; x < width; x++)       { if (colHasContent(x)) { left   = x; break; } }
  for (let x = width - 1; x >= 0; x--) { if (colHasContent(x)) { right  = x; break; } }

  const PAD   = 12;
  const cropX = Math.max(0, left   - PAD);
  const cropY = Math.max(0, top    - PAD);
  const cropW = Math.min(width,  right  + PAD + 1) - cropX;
  const cropH = Math.min(height, bottom + PAD + 1) - cropY;

  const ratio      = (cropW * cropH) / (width * height);
  const degenerate = cropW < 300 || cropH < 300 || ratio < 0.5;

  const debugInfo = `orig:${width}×${height} T:${top} B:${bottom} L:${left} R:${right} crop:${cropW}×${cropH} (${Math.round(ratio * 100)}%)`;

  if (degenerate) {
    const originalDataUrl = await fileToDataUrl(file);
    return { croppedDataUrl: originalDataUrl, croppedBlob: file, degenerate: true, debugInfo };
  }

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width  = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) throw new Error('autoCrop: could not get crop 2d context');

  cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const croppedDataUrl = cropCanvas.toDataURL('image/jpeg', 0.92);
  const croppedBlob    = await new Promise<Blob>((resolve, reject) => {
    cropCanvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('autoCrop: toBlob returned null'))),
      'image/jpeg',
      0.92,
    );
  });

  return { croppedDataUrl, croppedBlob, degenerate: false, debugInfo };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
