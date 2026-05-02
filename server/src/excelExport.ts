import * as XLSX from 'xlsx-js-style';

interface ReceiptRow {
  storeName: string;
  receiptDate: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  category: string;
  lineItems: string | null;
  notes: string | null;
}

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '1a1a2e' } },
  border: {
    bottom: { style: 'thin', color: { rgb: '4ade80' } },
  },
};

const MONEY_FMT = '$#,##0.00';

function autoWidth(ws: XLSX.WorkSheet, data: (string | number)[][]) {
  const colWidths: number[] = [];
  data.forEach(row => {
    row.forEach((cell, c) => {
      const len = String(cell).length + 2;
      colWidths[c] = Math.max(colWidths[c] ?? 8, len);
    });
  });
  ws['!cols'] = colWidths.map(w => ({ wch: Math.min(w, 40) }));
}

export function buildExcel(
  receipts: ReceiptRow[],
  year: number,
  fullName: string,
  businessName: string
): { buffer: Buffer; fileName: string } {
  const wb = XLSX.utils.book_new();

  // ── Summary sheet ─────────────────────────────────────────────────────────
  const byCategory: Record<string, { count: number; subtotal: number; tax: number; total: number }> = {};
  receipts.forEach(r => {
    if (!byCategory[r.category]) byCategory[r.category] = { count: 0, subtotal: 0, tax: 0, total: 0 };
    byCategory[r.category].count++;
    byCategory[r.category].subtotal += r.subtotal;
    byCategory[r.category].tax      += r.taxAmount;
    byCategory[r.category].total    += r.total;
  });

  const summaryData: (string | number)[][] = [
    [`Expense Summary — ${year}`],
    [fullName + (businessName ? ` · ${businessName}` : '')],
    [],
    ['Category', 'Receipts', 'Subtotal', 'Tax', 'Total'],
    ...Object.entries(byCategory)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([cat, v]) => [cat, v.count, v.subtotal, v.tax, v.total]),
    [],
    ['TOTAL', receipts.length,
      receipts.reduce((s, r) => s + r.subtotal, 0),
      receipts.reduce((s, r) => s + r.taxAmount, 0),
      receipts.reduce((s, r) => s + r.total, 0),
    ],
  ];

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);

  // Style header row (row index 3 = 4th row, 0-indexed)
  const headerRowIdx = 3;
  ['A', 'B', 'C', 'D', 'E'].forEach(col => {
    const cell = summaryWs[`${col}${headerRowIdx + 1}`];
    if (cell) cell.s = HEADER_STYLE;
  });

  // Money format for subtotal/tax/total columns (C,D,E), rows 5 onward
  const dataStart = headerRowIdx + 2;
  for (let row = dataStart; row <= dataStart + Object.keys(byCategory).length + 1; row++) {
    ['C', 'D', 'E'].forEach(col => {
      const cell = summaryWs[`${col}${row}`];
      if (cell && typeof cell.v === 'number') cell.z = MONEY_FMT;
    });
  }

  // Title styling
  const titleCell = summaryWs['A1'];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } } };

  summaryWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  autoWidth(summaryWs, summaryData);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // ── Per-category sheets ───────────────────────────────────────────────────
  const categories = [...new Set(receipts.map(r => r.category))].sort();

  categories.forEach(cat => {
    const catReceipts = receipts
      .filter(r => r.category === cat)
      .sort((a, b) => a.receiptDate.localeCompare(b.receiptDate));

    const rows: (string | number)[][] = [
      ['Date', 'Store', 'Items', 'Subtotal', 'Tax', 'Total'],
      ...catReceipts.map(r => {
        const items = r.lineItems
          ? (JSON.parse(r.lineItems) as { description: string }[])
              .map(i => i.description)
              .join(', ')
          : '';
        return [r.receiptDate, r.storeName, items, r.subtotal, r.taxAmount, r.total];
      }),
      [],
      ['', '', 'TOTAL',
        catReceipts.reduce((s, r) => s + r.subtotal, 0),
        catReceipts.reduce((s, r) => s + r.taxAmount, 0),
        catReceipts.reduce((s, r) => s + r.total, 0),
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Header style
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach(col => {
      const cell = ws[`${col}1`];
      if (cell) cell.s = HEADER_STYLE;
    });

    // Money format D, E, F
    for (let row = 2; row <= catReceipts.length + 3; row++) {
      ['D', 'E', 'F'].forEach(col => {
        const cell = ws[`${col}${row}`];
        if (cell && typeof cell.v === 'number') cell.z = MONEY_FMT;
      });
    }

    autoWidth(ws, rows);

    // Sheet names max 31 chars
    const sheetName = cat.length > 31 ? cat.slice(0, 31) : cat;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const safeName = (fullName || 'User').replace(/[^a-z0-9]/gi, '_');
  const fileName = `Expenses_${year}_${safeName}.xlsx`;

  return { buffer, fileName };
}
