import sharp from 'sharp';

// ── Auto-crop (Sharp .trim()) — display image only, never OCR ────────────────
//
// PIPELINE ORDERING RULE — DO NOT REORDER:
//   OCR runs on the pre-trim buffer; Drive stores the post-trim image.
//   The trim is a leaf operation. It never feeds parsing/Vision/GPT.
//   `trimImageForDisplay()` returns a Buffer independent of the OCR path.
//   The caller MUST feed the ORIGINAL buffer to `extractReceiptLineItems`
//   and the TRIMMED buffer only to whatever will be stored (Drive, R2, etc.).
//   Never let a trimmed buffer flow back into extractReceiptLineItems.

/** Area floor: if the trim shrinks the image below this fraction of the
 *  original, discard the trim and keep the original. Guards against .trim()'s
 *  worst failure — a light receipt on a light background eating into the paper. */
const TRIM_AREA_FLOOR = 0.40;

/** Sharp .trim() threshold. 0 = only truly identical pixels; higher = more
 *  aggressive. 30 is the recommended starting point per the spec. */
const TRIM_THRESHOLD = 30;

export type TrimOutcome = 'applied' | 'no-op' | 'skipped-guard' | 'errored' | 'disabled';

export interface TrimResult {
  buffer: Buffer;   // always usable — original buffer if anything went wrong
  outcome: TrimOutcome;
  originalDims?: { width: number; height: number };
  trimmedDims?: { width: number; height: number };
  areaRatio?: number;
}

/**
 * Trim uniform borders off a receipt image for display/storage purposes.
 * NEVER feed the returned trimmed buffer back into the OCR pipeline —
 * OCR always runs on the pre-trim buffer.
 *
 * Behavior:
 *  - If .trim() produces a crop below TRIM_AREA_FLOOR of original area → discard trim, return original
 *  - If .trim() throws → return original, mark as 'errored'
 *  - If .trim() finds nothing to trim → returns the input roughly unchanged, marked 'no-op'
 *  - Otherwise returns the trimmed buffer, marked 'applied'
 */
export async function trimImageForDisplay(inputBuffer: Buffer): Promise<TrimResult> {
  if (process.env.ENABLE_AUTO_CROP !== 'true') {
    return { buffer: inputBuffer, outcome: 'disabled' };
  }

  try {
    const orig = sharp(inputBuffer);
    const origMeta = await orig.metadata();
    const origW = origMeta.width ?? 0;
    const origH = origMeta.height ?? 0;
    if (!origW || !origH) {
      return { buffer: inputBuffer, outcome: 'errored' };
    }

    const trimmedBuffer = await sharp(inputBuffer)
      .rotate() // honor EXIF orientation first, same as everywhere else
      .trim({ threshold: TRIM_THRESHOLD })
      .toBuffer();

    const trimmedMeta = await sharp(trimmedBuffer).metadata();
    const trimmedW = trimmedMeta.width ?? origW;
    const trimmedH = trimmedMeta.height ?? origH;

    const origArea = origW * origH;
    const trimmedArea = trimmedW * trimmedH;
    const areaRatio = trimmedArea / origArea;

    // Guard: over-aggressive trim → keep original
    if (areaRatio < TRIM_AREA_FLOOR) {
      return {
        buffer: inputBuffer,
        outcome: 'skipped-guard',
        originalDims: { width: origW, height: origH },
        trimmedDims: { width: trimmedW, height: trimmedH },
        areaRatio,
      };
    }

    // Effectively no-op: within 2% of original size means .trim() found no border
    if (areaRatio > 0.98) {
      return {
        buffer: trimmedBuffer,
        outcome: 'no-op',
        originalDims: { width: origW, height: origH },
        trimmedDims: { width: trimmedW, height: trimmedH },
        areaRatio,
      };
    }

    return {
      buffer: trimmedBuffer,
      outcome: 'applied',
      originalDims: { width: origW, height: origH },
      trimmedDims: { width: trimmedW, height: trimmedH },
      areaRatio,
    };
  } catch (err) {
    console.warn('[trim] failed, keeping original:', (err as Error).message);
    return { buffer: inputBuffer, outcome: 'errored' };
  }
}

export interface ReceiptLineItem {
  description: string;
  amount: number;
}

export interface ScannedReceiptData {
  vendor: string;
  date: string | null;
  lineItems: ReceiptLineItem[] | null;
  totalAmount: number;
  suggestedCategory: string;
  confidence: number;
  method: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const CATEGORY_LIST = [
  'Comm',
  'Loan/Interest',
  'Meals',
  'Medical',
  'Postage',
  'Supplies & Hardware',
  'AI Services',
  'Insurance',
  'Rent',
  'Travel',
  'Subscriptions',
];

// ── Stage 1: Google Cloud Vision OCR ─────────────────────────────────────────

async function extractTextWithGoogleVision(imageBase64: string): Promise<string> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_CLOUD_VISION_API_KEY not set');

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: 'TEXT_DETECTION' }],
        }],
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Vision API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    responses?: { fullTextAnnotation?: { text?: string }; error?: { message?: string } }[];
  };

  const text = data.responses?.[0]?.fullTextAnnotation?.text;
  const visionError = data.responses?.[0]?.error?.message;

  if (visionError) throw new Error(`Google Vision error: ${visionError}`);
  if (!text) throw new Error('Google Vision returned no text');

  console.log(`[Vision] OCR extracted ${text.length} chars, ${text.split('\n').length} lines`);
  console.log('[Vision] Raw OCR text:\n', text);

  return text;
}

// ── Stage 2: GPT-4o parses OCR text ──────────────────────────────────────────

async function parseReceiptText(ocrText: string, openaiKey: string): Promise<ScannedReceiptData> {
  const prompt = `You are a receipt parser. The following text was extracted from a receipt photo via OCR. Parse every line item into structured JSON.

THE PRINTED TOTAL IS YOUR GROUND TRUTH:
- First, find the final printed "Total" on the receipt. That is what the customer actually paid.
- Your line items + taxes MUST sum to this Total (within $0.05 tolerance for rounding).
- Treat parsing as a constraint-satisfaction problem: choose the set of items whose math reconciles with the printed Total.
- When you see ambiguous lines like "$4.34 x 2" appearing under an item already listed at $8.68, that is a QUANTITY BREAKDOWN of the same item. Include EITHER the parent ($8.68) OR the breakdown (two × $4.34) — never both. Pick whichever interpretation balances against the printed Total.
- Same for any "$X.XX x N" pattern under a parent line. It is one item OR N items, not N+1.
- Before returning JSON, verify: sum(non-tax items) + sum(taxes) ≈ printed Total. If it doesn't match, re-examine which lines are duplicates/breakdowns and fix.

OTHER RULES:
1. List every GENUINE distinct line item. Do not skip real items.
2. Duplicate descriptions are valid only when they are genuinely separate purchases on separate lines, NOT when they are a "$X x N" quantity breakdown of a parent line.
3. For Value Village / thrift store receipts: items appear as pairs of lines:
   - Line 1: item code (SP-28778) with Qty / Price / Total columns
   - Line 2: description (MEN-S/S CASUAL) followed by "Net Price: $X.XX"
   Every "Net Price:" line = one item.
4. Include GST, PST, HST, QST as separate line items with isTax: true.
5. Skip: Subtotal, Total, Grand Total, payment method lines, store address, phone numbers, transaction IDs.
6. totalAmount = the final printed Total after all taxes (e.g. if Total: $42.07, use 42.07).
7. date: YYYY-MM-DD format. Default to 2026 if year is ambiguous.
8. suggestedCategory: pick one from: ${CATEGORY_LIST.join(', ')}. Value Village/thrift → Supplies & Hardware. Restaurants → Meals. Gas → Travel.

Return ONLY valid JSON, no markdown, no explanation:
{
  "vendor": "Store name",
  "date": "YYYY-MM-DD",
  "lineItems": [
    { "description": "Item name", "amount": 12.49, "isTax": false },
    { "description": "GST", "amount": 4.28, "isTax": true }
  ],
  "totalAmount": 95.23,
  "suggestedCategory": "Supplies & Hardware",
  "confidence": 0.95
}

--- RECEIPT TEXT ---
${ocrText}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a receipt parser. Always return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errText}`);
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const usage = {
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
  };
  const finishReason = data.choices?.[0]?.finish_reason;
  const content = data.choices?.[0]?.message?.content;

  console.log(`[GPT-4o text] ${usage.completionTokens} tokens, finish_reason: ${finishReason}, length: ${content?.length ?? 0}`);
  console.log('[GPT-4o text] response:', content);

  if (!content) throw new Error('OpenAI returned no content');

  let clean = content.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(clean);
  return buildResult(parsed, usage, 'google-vision+gpt4o-text');
}

// ── Fallback: GPT-4o Vision (old approach) ───────────────────────────────────

async function parseReceiptImage(
  imageBase64: string,
  mimeType: string,
  openaiKey: string,
): Promise<ScannedReceiptData> {
  const prompt = `You are a receipt parser. Extract every line item from this receipt image.

Return ONLY valid JSON:
{
  "vendor": "Store name",
  "date": "YYYY-MM-DD or null",
  "lineItems": [
    { "description": "Item name", "amount": 12.99, "isTax": false },
    { "description": "GST", "amount": 0.65, "isTax": true }
  ],
  "totalAmount": 13.64,
  "suggestedCategory": "one of: ${CATEGORY_LIST.join(', ')}",
  "confidence": 0.9
}

GROUND TRUTH — THE PRINTED TOTAL:
- Find the final printed "Total" on the receipt. That is what the customer paid.
- Your line items + taxes MUST sum to this Total (within $0.05 for rounding).
- When you see "$X.XX x N" under a parent line (e.g. "$4.34 x 2" below an $8.68 cocktail), that is a QUANTITY BREAKDOWN of the same item — include EITHER the parent OR the breakdown, never both. Pick whichever makes the math reconcile.
- Before returning JSON, verify your items + taxes equal the printed Total. If not, find the duplicate/breakdown and fix it.

Rules:
- List every GENUINE distinct item. Duplicate descriptions are valid only for genuinely separate purchases, NOT for "$X x N" quantity breakdowns of a parent line.
- Include GST/PST/HST as separate items with isTax: true.
- totalAmount = the final printed total after all taxes.
- date: YYYY-MM-DD, default to 2026 if ambiguous.
- vendor: Use the shortest recognizable name, 1-3 words max. Drop location numbers, city names, legal suffixes. Examples: "Starbucks Coffee Canada" → "Starbucks", "Mobil 1724 Gas Bar" → "Mobil Gas", "Gorge Harbour Marina & Resort" → "Gorge Harbour", "Canadian Tire #142" → "Canadian Tire".`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a receipt parser. Always return valid JSON only.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Vision error ${response.status}: ${errText}`);
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const usage = {
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
  };
  const finishReason = data.choices?.[0]?.finish_reason;
  const content = data.choices?.[0]?.message?.content;

  console.log(`[GPT-4o vision] ${usage.completionTokens} tokens, finish_reason: ${finishReason}`);

  if (!content) throw new Error('OpenAI Vision returned no content');

  let clean = content.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(clean);
  return buildResult(parsed, usage, 'gpt-4o-vision');
}

// ── Shared result builder ─────────────────────────────────────────────────────

function buildResult(
  parsed: Record<string, unknown>,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
  method: string,
): ScannedReceiptData {
  type RawItem = { description?: unknown; amount?: unknown; isTax?: unknown };

  let lineItems: ReceiptLineItem[] | null = null;
  if (Array.isArray(parsed.lineItems) && parsed.lineItems.length > 0) {
    lineItems = (parsed.lineItems as RawItem[])
      .filter(item => item.description && typeof item.amount === 'number' && (item.amount as number) > 0)
      .map(item => ({
        description: String(item.description).trim(),
        amount: parseFloat(String(item.amount)) || 0,
      }));
    if (lineItems.length === 0) lineItems = null;
  }

  const suggestedCategory = CATEGORY_LIST.includes(parsed.suggestedCategory as string)
    ? (parsed.suggestedCategory as string)
    : 'Other';

  return {
    vendor: String(parsed.vendor || parsed.storeName || 'Unknown Vendor').trim(),
    date: (parsed.date as string | null) || null,
    lineItems,
    totalAmount: parseFloat(String(parsed.totalAmount || parsed.total || 0)) || 0,
    suggestedCategory,
    confidence: (parsed.confidence as number) || 0.8,
    method,
    usage,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function extractReceiptLineItems(
  imageBuffer: Buffer,
  originalName?: string
): Promise<ScannedReceiptData> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set');
    return fallback();
  }

  // Compress image for both OCR and fallback
  let finalBuffer = imageBuffer;
  let mimeType = 'image/jpeg';

  try {
    const compressed = await sharp(imageBuffer)
      .rotate()
      .resize(1600, null, { withoutEnlargement: true, fit: 'inside' })
      .greyscale()
      .jpeg({ quality: 70, progressive: true })
      .toBuffer();

    finalBuffer = compressed.length > 600_000
      ? await sharp(imageBuffer)
          .rotate()
          .resize(1000, null, { withoutEnlargement: true, fit: 'inside' })
          .greyscale()
          .jpeg({ quality: 60 })
          .toBuffer()
      : compressed;

    console.log(`Image compressed: ${finalBuffer.length} bytes`);
  } catch (sharpErr) {
    console.warn('sharp compression failed:', (sharpErr as Error).message);
    finalBuffer = imageBuffer;
    const ext = (originalName || '').toLowerCase();
    if (ext.endsWith('.png')) mimeType = 'image/png';
    else if (ext.endsWith('.webp')) mimeType = 'image/webp';
  }

  const imageBase64 = finalBuffer.toString('base64');

  // ── Try two-stage: Google Vision OCR → GPT-4o text parsing ──────────────
  if (process.env.GOOGLE_CLOUD_VISION_API_KEY) {
    try {
      console.log('[OCR] Trying Google Cloud Vision...');
      const ocrText = await extractTextWithGoogleVision(imageBase64);
      const result = await parseReceiptText(ocrText, OPENAI_API_KEY);
      console.log(`[OCR] Two-stage success: ${result.lineItems?.length ?? 0} items, total $${result.totalAmount}`);
      return result;
    } catch (visionErr) {
      console.error('[OCR] Google Vision failed, falling back to GPT-4o Vision:', (visionErr as Error).message);
    }
  } else {
    console.log('[OCR] No GOOGLE_CLOUD_VISION_API_KEY — using GPT-4o Vision directly');
  }

  // ── Fallback: GPT-4o Vision (image directly) ────────────────────────────
  try {
    console.log(`[OCR] Sending ${finalBuffer.length} bytes to GPT-4o Vision`);
    return await parseReceiptImage(imageBase64, mimeType, OPENAI_API_KEY);
  } catch (err) {
    console.error('[OCR] GPT-4o Vision failed:', (err as Error).message);
    return fallback();
  }
}

function fallback(): ScannedReceiptData {
  return {
    vendor: 'Unknown',
    date: null,
    lineItems: null,
    totalAmount: 0,
    suggestedCategory: 'Other',
    confidence: 0.1,
    method: 'failed',
  };
}
