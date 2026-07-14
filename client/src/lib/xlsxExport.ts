// Shared xlsx builder — used by the Export tab AND the Dashboard scoped-share
// feature so both surfaces produce identically-shaped spreadsheets.
//
// Contract:
//   - `rows` is the exact set to include (caller-side filtering already done)
//   - `title` is what appears in cell A1 of the Summary sheet
//   - `clientLabel` is optional — appended to the title if present
//
// Sheet layout is intentional and matches the accountant hand-off format:
//   - Summary sheet: per-category count + subtotal + tax + total, then a
//     Grand Total row.
//   - One sheet per category: date/store/client/items/subtotal/tax/total
//     rows sorted by date, then a Category Total row.
//
// Only tab labels are sanitized (Excel forbids : \ / ? * [ ] and caps at 31
// chars). The category's real name is preserved in cell contents.

import * as XLSX from 'xlsx';
import type { Receipt } from '../utils/types';

export interface BuildWorkbookOptions {
  rows: Receipt[];
  title: string;                  // e.g. "Expense Summary — 2026"
  clientLabel?: string | null;    // e.g. "A-frame" — appended to title if set
}

function safeSheetName(raw: string, used: Set<string>): string {
  let name = raw.replace(/[:\\/?*\[\]]/g, '-').trim();
  if (!name) name = 'Category';
  name = name.replace(/^'+|'+$/g, '');
  let candidate = name.slice(0, 31);
  if (!used.has(candidate.toLowerCase())) {
    used.add(candidate.toLowerCase());
    return candidate;
  }
  for (let n = 2; n < 1000; n++) {
    const suffix = ` (${n})`;
    const base = name.slice(0, 31 - suffix.length);
    candidate = `${base}${suffix}`;
    if (!used.has(candidate.toLowerCase())) {
      used.add(candidate.toLowerCase());
      return candidate;
    }
  }
  return `Category${used.size}`.slice(0, 31);
}

export function buildReceiptWorkbook({ rows, title, clientLabel }: BuildWorkbookOptions): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>(['summary']);

  // ── Summary sheet ─────────────────────────────────────────────────────────
  const byCat: Record<string, { count: number; subtotal: number; tax: number; total: number }> = {};
  rows.forEach(r => {
    const cat = r.category || 'Uncategorized';
    if (!byCat[cat]) byCat[cat] = { count: 0, subtotal: 0, tax: 0, total: 0 };
    byCat[cat].count++;
    byCat[cat].subtotal += r.subtotal;
    byCat[cat].tax      += r.taxAmount;
    byCat[cat].total    += r.total;
  });

  const heading = clientLabel ? `${title} — ${clientLabel}` : title;
  const summaryRows: (string | number)[][] = [
    [heading],
    [],
    ['Category', 'Receipts', 'Subtotal', 'Tax', 'Total'],
  ];
  Object.entries(byCat)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([cat, v]) => summaryRows.push([cat, v.count, v.subtotal, v.tax, v.total]));
  const grandSubtotal = rows.reduce((s, r) => s + r.subtotal, 0);
  const grandTax      = rows.reduce((s, r) => s + r.taxAmount, 0);
  const grandTotal    = rows.reduce((s, r) => s + r.total, 0);
  summaryRows.push(['Grand Total', rows.length, grandSubtotal, grandTax, grandTotal]);

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  const summaryRange = XLSX.utils.decode_range(summarySheet['!ref'] || 'A1');
  for (let row = 3; row <= summaryRange.e.r; row++) {
    ['C', 'D', 'E'].forEach(col => {
      const cell = summarySheet[`${col}${row + 1}`];
      if (cell) cell.z = '"$"#,##0.00';
    });
  }
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // ── Per-category sheets ───────────────────────────────────────────────────
  Object.entries(byCat).forEach(([cat]) => {
    const catRows = rows
      .filter(r => (r.category || 'Uncategorized') === cat)
      .sort((a, b) => (a.receiptDate || '').localeCompare(b.receiptDate || ''));

    const sheetRows: (string | number)[][] = [
      [cat],
      [],
      ['Date', 'Store', 'Client', 'Items', 'Subtotal', 'Tax', 'Total'],
    ];
    catRows.forEach(r => {
      let items = '';
      try {
        const parsed = JSON.parse(r.lineItems || '[]') as { description: string }[];
        items = parsed.map(i => i.description).join(', ');
      } catch { /* leave items blank */ }
      sheetRows.push([
        r.receiptDate,
        r.storeName,
        r.clientName || '',
        items,
        r.subtotal,
        r.taxAmount,
        r.total,
      ]);
    });
    const catSubtotal = catRows.reduce((s, r) => s + r.subtotal, 0);
    const catTax      = catRows.reduce((s, r) => s + r.taxAmount, 0);
    const catTotal    = catRows.reduce((s, r) => s + r.total, 0);
    sheetRows.push(['Category Total', '', '', '', catSubtotal, catTax, catTotal]);

    const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
    const sheetRange = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    for (let row = 3; row <= sheetRange.e.r; row++) {
      ['E', 'F', 'G'].forEach(col => {
        const cell = sheet[`${col}${row + 1}`];
        if (cell) cell.z = '"$"#,##0.00';
      });
    }
    sheet['!cols'] = [
      { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 40 },
      { wch: 10 }, { wch: 8 },  { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(cat, usedSheetNames));
  });

  return wb;
}

// Download a workbook as a file. Filename should NOT include the .xlsx —
// XLSX.writeFile handles that. Sanitize any client name yourself before
// passing (spaces are fine, but avoid slashes/quotes).
export function downloadWorkbook(wb: XLSX.WorkBook, fileName: string): void {
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

// Convert a workbook to a File object suitable for the Web Share API on
// mobile browsers. Falls back to a Blob-backed File on older browsers.
export function workbookToFile(wb: XLSX.WorkBook, fileName: string): File {
  const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return new File([blob], `${fileName}.xlsx`, { type: blob.type });
}
