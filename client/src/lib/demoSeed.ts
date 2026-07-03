import { addReceipt } from './db';
import type { Receipt } from '../utils/types';

// Fake receipts spanning ~12 months across a mix of categories.
// Amounts, stores, and item counts are hand-tuned to make the chart look believable.

const STORES = [
  { store: 'Home Depot',      category: 'Supplies & Hardware', low: 45,  high: 380, items: ['2x4 Lumber', 'Drywall Screws', 'Paint Roller', 'Blue Tape', 'Utility Knife', 'Sandpaper'] },
  { store: 'Rona',            category: 'Supplies & Hardware', low: 30,  high: 210, items: ['Caulking', 'Nails', 'Extension Cord', 'Shop Rag'] },
  { store: 'Canadian Tire',   category: 'Supplies & Hardware', low: 20,  high: 150, items: ['Wrench Set', 'Gloves', 'Ratchet Strap'] },
  { store: 'Esso',            category: 'Auto/gas',            low: 40,  high: 95,  items: ['Regular Unleaded'] },
  { store: 'Shell',           category: 'Auto/gas',            low: 45,  high: 100, items: ['Regular Unleaded'] },
  { store: 'Petro Canada',    category: 'Auto/gas',            low: 35,  high: 90,  items: ['Regular Unleaded'] },
  { store: 'Starbucks',       category: 'Meals',               low: 6,   high: 18,  items: ['Latte', 'Muffin', 'Sandwich'] },
  { store: 'Nhau Vietnamese', category: 'Meals',               low: 22,  high: 68,  items: ['Pho Bo', 'Spring Rolls', 'Bahn Mi'] },
  { store: 'Tim Hortons',     category: 'Meals',               low: 4,   high: 22,  items: ['Coffee', 'Bagel', 'Wrap'] },
  { store: 'BC Ferries',      category: 'Travel',              low: 18,  high: 92,  items: ['Passenger Fare', 'Vehicle Fare'] },
  { store: 'Air Canada',      category: 'Travel',              low: 180, high: 620, items: ['Flight', 'Baggage Fee'] },
  { store: 'Namecheap',       category: 'Subscriptions',       low: 12,  high: 68,  items: ['Domain Registration', 'ICANN Fee'] },
  { store: 'GitHub',          category: 'Subscriptions',       low: 4,   high: 22,  items: ['Copilot Monthly'] },
];

const CLIENTS = ['A-frame', 'Vance', 'McKinley', null, null]; // some receipts with no client

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randMoney(min: number, max: number): number { return Math.round((Math.random() * (max - min) + min) * 100) / 100; }

// Pick a date within the last 12 calendar months
function randomDateWithinMonths(monthsBack: number): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  const spanMs = now.getTime() - start.getTime();
  const d = new Date(start.getTime() + Math.random() * spanMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function seedDemoReceipts(userId: string, count = 24): Promise<Receipt[]> {
  const created: Receipt[] = [];
  const iso = new Date().toISOString();

  for (let i = 0; i < count; i++) {
    const s = pick(STORES);
    const numItems = randInt(1, Math.min(4, s.items.length));
    const items: { description: string; amount: number }[] = [];
    let subtotal = 0;
    for (let j = 0; j < numItems; j++) {
      const desc = s.items[j % s.items.length];
      const amt = randMoney(s.low / numItems, s.high / numItems);
      items.push({ description: desc, amount: amt });
      subtotal += amt;
    }
    subtotal = Math.round(subtotal * 100) / 100;

    // 5% GST + 7% PST for BC-ish feel
    const gst = Math.round(subtotal * 0.05 * 100) / 100;
    const pst = Math.round(subtotal * 0.07 * 100) / 100;
    const total = Math.round((subtotal + gst + pst) * 100) / 100;

    const lineItems = [
      ...items,
      { description: 'GST', amount: gst },
      { description: 'PST', amount: pst },
    ];

    const r = await addReceipt(userId, {
      uuid: `demo-${crypto.randomUUID()}`,
      storeName: s.store,
      receiptDate: randomDateWithinMonths(12),
      subtotal,
      taxAmount: gst + pst,
      total,
      category: s.category,
      clientName: pick(CLIENTS),
      lineItems: JSON.stringify(lineItems),
      rawLineItems: JSON.stringify(lineItems),
      taxLines: JSON.stringify([
        { label: 'GST', amount: gst },
        { label: 'PST', amount: pst },
      ]),
      imagePath: null,
      imageUrl: null,
      notes: null,
      createdAt: iso,
      updatedAt: iso,
    });
    created.push(r);
  }
  return created;
}

/**
 * Delete every receipt with a UUID starting with "demo-". Safe to call on any device;
 * won't touch real receipts.
 */
export async function clearDemoReceipts(userId: string, all: Receipt[]): Promise<number> {
  const { deleteReceipt } = await import('./db');
  const demos = all.filter(r => r.uuid?.startsWith('demo-'));
  for (const r of demos) {
    await deleteReceipt(userId, r.id);
  }
  return demos.length;
}
