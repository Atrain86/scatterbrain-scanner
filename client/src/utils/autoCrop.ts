/**
 * autoCrop.ts — canvas-based edge detection for receipt images.
 *
 * Returns { croppedDataUrl, croppedBlob, degenerate }.
 * degenerate = true when the cropped area is < 50% of the original OR either
 * dimension is < 300 px. When degenerate the original image is returned as
 * croppedDataUrl/croppedBlob so the caller can use it as a fallback.
 */

export async function autoCrop(
  file: File,
  threshold = 10,
): Promise<{ croppedDataUrl: string; croppedBlob: Blob; degenerate: boolean }> {
  // Load the file into an HTMLImageElement
  const imageBitmap = await createImageBitmap(file);
  const { width, height } = imageBitmap;

  // Draw to an offscreen canvas so we can read pixel data
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('autoCrop: could not get 2d context');

  ctx.drawImage(imageBitmap, 0, 0);
  imageBitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data; // Uint8ClampedArray, [r,g,b,a, r,g,b,a, ...]

  // Helper: get r,g,b at pixel (x, y)
  function getPixel(x: number, y: number): [number, number, number] {
    const idx = (y * width + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2]];
  }

  // Background color = top-left corner pixel
  const [bgR, bgG, bgB] = getPixel(0, 0);

  // Check whether a pixel differs from background by more than threshold in any channel
  function differsFromBg(x: number, y: number): boolean {
    const [r, g, b] = getPixel(x, y);
    return (
      Math.abs(r - bgR) > threshold ||
      Math.abs(g - bgG) > threshold ||
      Math.abs(b - bgB) > threshold
    );
  }

  // Scan from top edge inward
  let top = 0;
  outer_top: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (differsFromBg(x, y)) { top = y; break outer_top; }
    }
  }

  // Scan from bottom edge inward
  let bottom = height - 1;
  outer_bottom: for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      if (differsFromBg(x, y)) { bottom = y; break outer_bottom; }
    }
  }

  // Scan from left edge inward
  let left = 0;
  outer_left: for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (differsFromBg(x, y)) { left = x; break outer_left; }
    }
  }

  // Scan from right edge inward
  let right = width - 1;
  outer_right: for (let x = width - 1; x >= 0; x--) {
    for (let y = 0; y < height; y++) {
      if (differsFromBg(x, y)) { right = x; break outer_right; }
    }
  }

  // Add 4 px padding on each side, clamped to image bounds
  const PAD = 4;
  const cropX = Math.max(0, left - PAD);
  const cropY = Math.max(0, top - PAD);
  const cropW = Math.min(width,  right  + PAD + 1) - cropX;
  const cropH = Math.min(height, bottom + PAD + 1) - cropY;

  // Degeneracy check
  const originalArea = width * height;
  const croppedArea   = cropW * cropH;
  const degenerate =
    cropW < 300 ||
    cropH < 300 ||
    croppedArea < originalArea * 0.5;

  if (degenerate) {
    // Return original file as both dataUrl and Blob
    const originalDataUrl = await fileToDataUrl(file);
    return { croppedDataUrl: originalDataUrl, croppedBlob: file, degenerate: true };
  }

  // Draw the cropped region to a new canvas
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width  = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) throw new Error('autoCrop: could not get crop 2d context');

  cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const croppedDataUrl = cropCanvas.toDataURL('image/jpeg', 0.92);
  const croppedBlob = await new Promise<Blob>((resolve, reject) => {
    cropCanvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('autoCrop: toBlob returned null'))),
      'image/jpeg',
      0.92,
    );
  });

  return { croppedDataUrl, croppedBlob, degenerate: false };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
