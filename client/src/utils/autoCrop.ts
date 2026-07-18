/**
 * autoCrop.ts — canvas-based edge detection for receipt images.
 *
 * Strategy: a row/column is considered "background" if fewer than CONTENT_RATIO
 * of its pixels differ from the sampled background colour by more than THRESHOLD.
 * This tolerates natural variation in wood, fabric, and other busy backgrounds —
 * a single noisy pixel no longer anchors the crop boundary.
 *
 * Returns { croppedDataUrl, croppedBlob, degenerate }.
 * degenerate = true when the cropped area is < 50% of the original OR either
 * dimension is < 300 px. When degenerate the original image is returned unchanged.
 */

const THRESHOLD     = 30;   // per-channel delta to count a pixel as "not background"
const CONTENT_RATIO = 0.03; // fraction of a row/col that must differ to be "content"
                            // 3% = ~90px on a 3024px-wide row — receipt edge is narrow

export async function autoCrop(
  file: File,
  threshold = THRESHOLD,
): Promise<{ croppedDataUrl: string; croppedBlob: Blob; degenerate: boolean }> {
  const imageBitmap = await createImageBitmap(file);
  const { width, height } = imageBitmap;

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('autoCrop: could not get 2d context');

  ctx.drawImage(imageBitmap, 0, 0);
  imageBitmap.close();

  const fullData = ctx.getImageData(0, 0, width, height);
  const { data } = fullData;


  // Sample background from a small average of the four corners to reduce noise
  function cornerPixel(x: number, y: number): [number, number, number] {
    const idx = (y * width + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2]];
  }
  const corners = [
    cornerPixel(0, 0),
    cornerPixel(width - 1, 0),
    cornerPixel(0, height - 1),
    cornerPixel(width - 1, height - 1),
  ];
  const bgR = Math.round(corners.reduce((s, c) => s + c[0], 0) / 4);
  const bgG = Math.round(corners.reduce((s, c) => s + c[1], 0) / 4);
  const bgB = Math.round(corners.reduce((s, c) => s + c[2], 0) / 4);

  function pixelDiffersFromBg(x: number, y: number): boolean {
    const idx = (y * width + x) * 4;
    return (
      Math.abs(data[idx]     - bgR) > threshold ||
      Math.abs(data[idx + 1] - bgG) > threshold ||
      Math.abs(data[idx + 2] - bgB) > threshold
    );
  }

  // Returns true if a row has enough content pixels to be considered non-background
  function rowHasContent(y: number): boolean {
    let count = 0;
    const needed = Math.ceil(width * CONTENT_RATIO);
    for (let x = 0; x < width; x++) {
      if (pixelDiffersFromBg(x, y)) {
        count++;
        if (count >= needed) return true;
      }
    }
    return false;
  }

  // Returns true if a column has enough content pixels
  function colHasContent(x: number): boolean {
    let count = 0;
    const needed = Math.ceil(height * CONTENT_RATIO);
    for (let y = 0; y < height; y++) {
      if (pixelDiffersFromBg(x, y)) {
        count++;
        if (count >= needed) return true;
      }
    }
    return false;
  }

  let top    = 0;
  let bottom = height - 1;
  let left   = 0;
  let right  = width - 1;

  for (let y = 0; y < height; y++)         { if (rowHasContent(y)) { top    = y; break; } }
  for (let y = height - 1; y >= 0; y--)    { if (rowHasContent(y)) { bottom = y; break; } }
  for (let x = 0; x < width; x++)          { if (colHasContent(x)) { left   = x; break; } }
  for (let x = width - 1; x >= 0; x--)     { if (colHasContent(x)) { right  = x; break; } }

  const PAD  = 8;
  const cropX = Math.max(0, left   - PAD);
  const cropY = Math.max(0, top    - PAD);
  const cropW = Math.min(width,  right  + PAD + 1) - cropX;
  const cropH = Math.min(height, bottom + PAD + 1) - cropY;

  const originalArea = width * height;
  const croppedArea  = cropW * cropH;
  const ratio = croppedArea / originalArea;
  const degenerate   =
    cropW < 300 ||
    cropH < 300 ||
    ratio < 0.5;

  alert(
    `bg: rgb(${bgR},${bgG},${bgB})\n` +
    `edges T:${top} B:${bottom} L:${left} R:${right}\n` +
    `crop: ${cropW}×${cropH} (${(ratio*100).toFixed(0)}% of orig)\n` +
    `degenerate: ${degenerate}`
  );

  console.log('[autoCrop]', {
    imageSize: `${width}×${height}`,
    bg: `rgb(${bgR},${bgG},${bgB})`,
    edges: { top, bottom, left, right },
    crop: { cropX, cropY, cropW, cropH },
    originalArea, croppedArea,
    ratio: (croppedArea / originalArea).toFixed(2),
    degenerate,
  });

  if (degenerate) {
    const originalDataUrl = await fileToDataUrl(file);
    return { croppedDataUrl: originalDataUrl, croppedBlob: file, degenerate: true };
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
      blob => (blob ? resolve(blob) : reject(new Error('autoCrop: toBlob returned null'))),
      'image/jpeg',
      0.92,
    );
  });

  return { croppedDataUrl, croppedBlob, degenerate: false };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
