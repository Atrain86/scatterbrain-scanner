import sharp from 'sharp';

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

export async function extractReceiptLineItems(
  imageBuffer: Buffer,
  originalName?: string
): Promise<ScannedReceiptData> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set');
    return fallback();
  }

  // Server-side compression (same logic as PaintBrain)
  let finalBuffer = imageBuffer;
  let mimeType = 'image/jpeg';

  try {
    const compressed = await sharp(imageBuffer)
      .rotate()                                                   // auto-rotate from EXIF
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
    console.warn('sharp compression failed, using original buffer:', (sharpErr as Error).message);
    finalBuffer = imageBuffer;
    const ext = (originalName || '').toLowerCase();
    if (ext.endsWith('.png')) mimeType = 'image/png';
    else if (ext.endsWith('.webp')) mimeType = 'image/webp';
  }

  console.log(`Sending ${finalBuffer.length} bytes to OpenAI as ${mimeType}`);

  const imageBase64 = finalBuffer.toString('base64');

  const prompt = `You are a receipt parser. Your job is to extract EVERY SINGLE line item — do not summarize, do not skip, do not group items together.

Return ONLY valid JSON — no markdown, no explanation, no code fences:
{
  "vendor": "Store name",
  "date": "YYYY-MM-DD or null",
  "lineItems": [
    { "description": "Item name", "amount": 12.99 },
    { "description": "GST", "amount": 0.65 }
  ],
  "totalAmount": 13.64,
  "suggestedCategory": "one of: ${CATEGORY_LIST.join(', ')}",
  "confidence": 0.9
}

CRITICAL RULES — follow exactly:
1. List EVERY item with a price. A 20-item receipt must have 20 entries. Do not stop early.
2. For Value Village receipts: each purchase spans two lines:
   - Line 1: item code (SP-28778), Qty, Price, Total
   - Line 2: description (MEN-S/S CASUAL) + "Net Price: $X.XX"
   Count every "Net Price:" occurrence — that is exactly one item. If you see 20 "Net Price:" lines, output 20 items.
3. Include GST, PST, HST as separate lineItems entries.
4. Do NOT include Subtotal, Total, or Grand Total in lineItems.
5. totalAmount = the number next to "Total" at the bottom of the receipt (after all taxes). NOT the subtotal.
6. If receipt shows "Subtotal: $85.82 / GST: $4.28 / PST: $5.13 / Total: $95.23" — totalAmount is 95.23.
7. suggestedCategory: Value Village/thrift → Supplies & Hardware. Restaurants → Meals. Gas stations → Auto/gas. Hardware stores → Supplies & Hardware. Hotels/flights → Travel.
8. date: YYYY-MM-DD. Year 2026 and 2023 look similar on thermal paper — default to 2026 if ambiguous.
9. Close the JSON properly with } at the end.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
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
      console.error('OpenAI error:', response.status, errText);
      return fallback();
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model?: string;
    };
    const usage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    };
    const finishReason = data.choices?.[0]?.finish_reason;
    const content = data.choices?.[0]?.message?.content;
    console.log(`OpenAI response: ${usage.completionTokens} completion tokens, finish_reason: ${finishReason}, content length: ${content?.length ?? 0}`);
    console.log('OpenAI raw response:', content);
    if (!content) {
      console.error('OpenAI returned no content:', JSON.stringify(data));
      return fallback();
    }

    let clean = content.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(clean);

    let lineItems: ReceiptLineItem[] | null = null;
    if (Array.isArray(parsed.lineItems) && parsed.lineItems.length > 0) {
      lineItems = parsed.lineItems
        .filter((item: { description?: unknown; amount?: unknown }) =>
          item.description && typeof item.amount === 'number' && item.amount > 0
        )
        .map((item: { description: unknown; amount: unknown }) => ({
          description: String(item.description).trim(),
          amount: parseFloat(String(item.amount)) || 0,
        }));
      if (lineItems!.length === 0) lineItems = null;
    }

    const suggestedCategory = CATEGORY_LIST.includes(parsed.suggestedCategory)
      ? parsed.suggestedCategory
      : 'Other';

    return {
      vendor: String(parsed.vendor || 'Unknown Vendor').trim(),
      date: parsed.date || null,
      lineItems,
      totalAmount: parseFloat(parsed.totalAmount) || 0,
      suggestedCategory,
      confidence: parsed.confidence || 0.8,
      method: 'gpt-4o-vision',
      usage,
    };
  } catch (err) {
    console.error('Vision extraction failed:', (err as Error).message);
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
