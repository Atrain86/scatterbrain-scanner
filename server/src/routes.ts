import { Router, Request, Response } from 'express';
import multer from 'multer';
import { desc } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db } from './db.js';
import { receipts } from './schema.js';
import { extractReceiptLineItems } from './visionHandler.js';
import { uploadReceiptImage, deleteReceiptImage } from './r2.js';
import { buildExcel } from './excelExport.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Receipts ──────────────────────────────────────────────────────────────────

// Scan (parse only — does NOT save)
router.post('/receipts/scan', upload.single('receipt'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  try {
    const result = await extractReceiptLineItems(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ error: 'Scan failed' });
  }
});

// Save receipt after user confirms line items
router.post('/receipts', upload.single('receipt'), async (req: Request, res: Response) => {
  const { storeName, receiptDate, subtotal, taxAmount, total, category, clientName, lineItems, taxLines, notes } = req.body;

  if (!storeName || !receiptDate) {
    res.status(400).json({ error: 'storeName and receiptDate are required' });
    return;
  }

  let imagePath = '';
  let imageUrl = '';

  if (req.file) {
    try {
      if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID) {
        const uploaded = await uploadReceiptImage(req.file.buffer, req.file.originalname, 1);
        imagePath = uploaded.key;
        imageUrl = uploaded.url;
      } else {
        // No R2 configured — store as base64 data URL directly in DB
        const mime = req.file.mimetype || 'image/jpeg';
        imageUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
        imagePath = 'base64';
      }
    } catch (err) {
      console.error('Image storage failed:', err);
    }
  }

  const receipt = db.insert(receipts).values({
    storeName,
    receiptDate,
    subtotal: parseFloat(subtotal) || 0,
    taxAmount: parseFloat(taxAmount) || 0,
    total: parseFloat(total) || 0,
    category: category || 'Other',
    clientName: clientName || '',
    lineItems: lineItems || null,
    taxLines: taxLines || null,
    imagePath,
    imageUrl,
    notes: notes || null,
  }).returning().get();

  res.json(receipt);
});

// List all receipts
router.get('/receipts', (_req: Request, res: Response) => {
  const all = db.select().from(receipts)
    .orderBy(desc(receipts.receiptDate))
    .all();
  res.json(all);
});

// Get single receipt
router.get('/receipts/:id', (req: Request, res: Response) => {
  const receipt = db.select().from(receipts)
    .where(eq(receipts.id, parseInt(req.params.id)))
    .get();
  if (!receipt) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(receipt);
});

// Update receipt
router.put('/receipts/:id', (req: Request, res: Response) => {
  const { storeName, receiptDate, subtotal, taxAmount, total, category, clientName, lineItems, taxLines, notes } = req.body;
  db.update(receipts)
    .set({
      storeName, receiptDate,
      subtotal: parseFloat(subtotal) || 0,
      taxAmount: parseFloat(taxAmount) || 0,
      total: parseFloat(total) || 0,
      category,
      clientName: clientName ?? undefined,
      lineItems, taxLines, notes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(receipts.id, parseInt(req.params.id)))
    .run();
  res.json({ ok: true });
});

// Delete receipt
router.delete('/receipts/:id', async (req: Request, res: Response) => {
  const receipt = db.select().from(receipts)
    .where(eq(receipts.id, parseInt(req.params.id)))
    .get();
  if (!receipt) { res.status(404).json({ error: 'Not found' }); return; }

  if (receipt.imagePath) await deleteReceiptImage(receipt.imagePath);

  db.delete(receipts)
    .where(eq(receipts.id, parseInt(req.params.id)))
    .run();

  res.json({ ok: true });
});

// ── Export ────────────────────────────────────────────────────────────────────

router.get('/export/download', async (req: Request, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const clientFilter = (req.query.client as string | undefined)?.trim() || '';

  const allReceipts = db.select().from(receipts)
    .all()
    .filter(r => {
      if (!r.receiptDate.startsWith(String(year))) return false;
      if (clientFilter && (r.clientName || '') !== clientFilter) return false;
      return true;
    });

  try {
    const { buffer, fileName } = buildExcel(allReceipts, year, '', '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Export failed:', err);
    res.status(500).json({ error: 'Failed to generate export' });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    openai: !!process.env.OPENAI_API_KEY,
    r2: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID),
  });
});

export default router;
