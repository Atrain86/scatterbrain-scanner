import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = 'Scatterbrain Scanner <receipts@scatterbrainscanner.com>';

export interface ShareReceiptPayload {
  to: string;
  replyTo: string;
  storeName: string;
  date: string;
  total: number;
  category: string;
  lineItemsHtml: string;
  imageUrl?: string | null;
}

export async function sendReceiptEmail(payload: ShareReceiptPayload): Promise<void> {
  if (!resend) {
    console.warn('Resend not configured — email not sent');
    return;
  }

  const { to, replyTo, storeName, date, total, category, lineItemsHtml, imageUrl } = payload;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#1a1a2e;border:1px solid #333;border-radius:16px;overflow:hidden;">
      <div style="padding:20px 24px;border-bottom:1px solid #333;">
        <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#fff;">${storeName}</p>
        <p style="margin:0;font-size:13px;color:#888;">${date} · ${category}</p>
      </div>
      ${lineItemsHtml ? `
      <div style="padding:16px 24px;border-bottom:1px solid #333;">
        ${lineItemsHtml}
      </div>` : ''}
      <div style="padding:16px 24px;display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#888;font-size:14px;">Total</span>
        <span style="color:#4ade80;font-size:20px;font-weight:700;">$${total.toFixed(2)}</span>
      </div>
      ${imageUrl ? `
      <div style="padding:0 24px 20px;">
        <img src="${imageUrl}" alt="Receipt" style="width:100%;border-radius:12px;border:1px solid #333;" />
      </div>` : ''}
    </div>
    <p style="text-align:center;color:#555;font-size:12px;margin-top:20px;">
      Sent via Scatterbrain Scanner · From the makers of PaintBrain
    </p>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to,
    reply_to: replyTo,
    subject: `Receipt from ${storeName} — $${total.toFixed(2)}`,
    html,
  });
}

export interface ExportEmailPayload {
  to: string;
  replyTo: string;
  year: number;
  totalAmount: number;
  receiptCount: number;
  categoryCount: number;
  excelBuffer: Buffer;
  fileName: string;
}

export async function sendExportEmail(payload: ExportEmailPayload): Promise<void> {
  if (!resend) {
    console.warn('Resend not configured — export email not sent');
    return;
  }

  const { to, replyTo, year, totalAmount, receiptCount, categoryCount, excelBuffer, fileName } = payload;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#1a1a2e;border:1px solid #333;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px;color:#fff;font-size:20px;">Expense Report — ${year}</h2>
      <p style="margin:0 0 20px;color:#888;font-size:14px;">Your full expense summary is attached.</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#888;font-size:14px;">Total expenses</span>
          <span style="color:#4ade80;font-size:14px;font-weight:700;">$${totalAmount.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#888;font-size:14px;">Receipts</span>
          <span style="color:#fff;font-size:14px;">${receiptCount}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#888;font-size:14px;">Categories</span>
          <span style="color:#fff;font-size:14px;">${categoryCount}</span>
        </div>
      </div>
    </div>
    <p style="text-align:center;color:#555;font-size:12px;margin-top:20px;">
      Sent via Scatterbrain Scanner · From the makers of PaintBrain
    </p>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to,
    reply_to: replyTo,
    subject: `Expense Report — ${year}`,
    html,
    attachments: [
      {
        filename: fileName,
        content: excelBuffer.toString('base64'),
      },
    ],
  });
}
