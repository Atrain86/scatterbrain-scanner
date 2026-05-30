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
      .resize(800, null, { withoutEnlargement: true, fit: 'inside' })
      .greyscale()
      .jpeg({ quality: 65, progressive: true })
      .toBuffer();

    finalBuffer = compressed.length > 250_000
      ? await sharp(imageBuffer)
          .resize(500, null, { withoutEnlargement: true, fit: 'inside' })
          .greyscale()
          .jpeg({ quality: 50 })
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

  const prompt = `You are a receipt parser. Extract every individual line item from this receipt image.

Return ONLY this JSON — no markdown, no explanation, no code fences:
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

Rules:
- Include EVERY line item with a dollar amount (products, services, fees, AND taxes like GST/PST/HST/QST)
- For thrift/discount stores (Value Village, Goodwill, etc): items often have short codes like "HW-KITCHEN STO 2.99" or "CLO-WOMENS 4.99" — include all of them with their price
- Some receipts show each item on two lines (code + price on separate lines) — match them correctly
- Do NOT include subtotal, total, or grand total rows in lineItems
- totalAmount = the FINAL TOTAL printed at the bottom of the receipt (after all taxes). This is the number labeled "TOTAL", "GRAND TOTAL", or "AMOUNT DUE" — NOT the subtotal. Look for the largest labeled total at the bottom.
- If the receipt shows subtotal + GST + PST separately, totalAmount = subtotal + GST + PST combined
- suggestedCategory: Thrift/consignment stores → Supplies & Hardware. Restaurants/cafes → Meals. Hardware/tools → Supplies & Hardware. Phone/internet → Comm. Hotels/flights → Travel. OpenAI/Claude/software → AI Services. Doctor/pharmacy → Medical. Office rent → Rent. Netflix/SaaS → Subscriptions. Stamps/shipping → Postage. Car loans/credit → Loan/Interest.
- If you cannot read individual line items but can read the total, set lineItems to null and set totalAmount
- If completely unreadable, set confidence below 0.4 and lineItems to null, totalAmount to 0
- date must be YYYY-MM-DD or null. Read the year carefully — 2026 and 2023 look similar in thermal receipt fonts. If the receipt is recent, bias toward the current year (2026).
- IMPORTANT: always close the JSON properly with } at the end`;

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
