import { useState, useMemo } from 'react';
import { Download, CheckCircle, FileSpreadsheet, User } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useReceipts } from '../hooks/useReceipts';
import type { Receipt } from '../utils/types';

export default function ExportPage() {
  const { receipts } = useReceipts();

  const currentYear = new Date().getFullYear();
  const [year,            setYear]            = useState(currentYear);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [exporting,       setExporting]       = useState(false);
  const [done,            setDone]            = useState(false);
  const [error,           setError]           = useState('');

  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

  const yearReceipts = useMemo(
    () => receipts.filter(r => r.receiptDate.startsWith(String(year))),
    [receipts, year]
  );

  const clientNames = useMemo(() => {
    const names = new Set<string>();
    yearReceipts.forEach(r => names.add(r.clientName?.trim() || ''));
    return Array.from(names).sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    });
  }, [yearReceipts]);

  function handleYearChange(y: number) {
    setYear(y);
    setSelectedClients(new Set());
    setDone(false);
  }

  function toggleClient(name: string) {
    setSelectedClients(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const exportReceipts = useMemo(() => {
    if (selectedClients.size === 0) return yearReceipts;
    return yearReceipts.filter(r => selectedClients.has(r.clientName?.trim() || ''));
  }, [yearReceipts, selectedClients]);

  const exportTotal = exportReceipts.reduce((s, r) => s + r.total, 0);

  function buildWorkbook(rows: Receipt[], clientLabel: string | null) {
    const wb = XLSX.utils.book_new();

    // ── Summary sheet ──────────────────────────────────────────────────────────
    const byCat: Record<string, { count: number; subtotal: number; tax: number; total: number }> = {};
    rows.forEach(r => {
      if (!byCat[r.category]) byCat[r.category] = { count: 0, subtotal: 0, tax: 0, total: 0 };
      byCat[r.category].count++;
      byCat[r.category].subtotal += r.subtotal;
      byCat[r.category].tax      += r.taxAmount;
      byCat[r.category].total    += r.total;
    });

    const summaryRows: (string | number)[][] = [
      [`Expense Summary — ${year}${clientLabel ? ` — ${clientLabel}` : ''}`],
      [],
      ['Category', 'Receipts', 'Subtotal', 'Tax', 'Total'],
    ];
    Object.entries(byCat).sort((a, b) => b[1].total - a[1].total).forEach(([cat, v]) => {
      summaryRows.push([cat, v.count, v.subtotal, v.tax, v.total]);
    });
    const grandSubtotal = rows.reduce((s, r) => s + r.subtotal, 0);
    const grandTax      = rows.reduce((s, r) => s + r.taxAmount, 0);
    summaryRows.push(['Grand Total', rows.length, grandSubtotal, grandTax, exportTotal]);

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    // Currency format for columns C-E (subtotal, tax, total)
    const range = XLSX.utils.decode_range(summarySheet['!ref'] || 'A1');
    for (let row = 3; row <= range.e.r; row++) {
      ['C', 'D', 'E'].forEach(col => {
        const cell = summarySheet[`${col}${row + 1}`];
        if (cell) cell.z = '"$"#,##0.00';
      });
    }
    summarySheet['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // ── Per-category sheets ────────────────────────────────────────────────────
    Object.entries(byCat).forEach(([cat]) => {
      const catRows = rows.filter(r => r.category === cat).sort((a, b) => a.receiptDate.localeCompare(b.receiptDate));
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
        } catch {}
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
      sheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 8 }, { wch: 10 }];
      // Sheet names max 31 chars
      XLSX.utils.book_append_sheet(wb, sheet, cat.slice(0, 31));
    });

    return wb;
  }

  async function handleDownload() {
    setError('');
    setExporting(true);
    try {
      const targets = selectedClients.size > 0 ? Array.from(selectedClients) : [null];
      for (const client of targets) {
        const rows = client !== null
          ? exportReceipts.filter(r => (r.clientName?.trim() || '') === client)
          : exportReceipts;

        const wb = buildWorkbook(rows, client);
        const suffix = client ? `_${client.replace(/[^a-z0-9]/gi, '_')}` : '';
        const fileName = `Expenses_${year}${suffix}.xlsx`;
        XLSX.writeFile(wb, fileName);
      }
      setDone(true);
    } catch (err) {
      setError((err as Error).message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-sb-bg flex flex-col">
        <header className="sticky top-0 z-20 bg-sb-bg border-b border-sb-border safe-top">
          <div className="px-4 py-3 max-w-2xl mx-auto w-full">
            <h1 className="text-base font-bold text-white text-center">Export</h1>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-6 pb-24 max-w-2xl mx-auto w-full">
          <div className="w-16 h-16 rounded-full bg-green-950/40 border border-green-800/40 flex items-center justify-center mb-5">
            <CheckCircle size={28} className="text-sb-green" />
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">Downloaded!</h2>
          <p className="text-sb-muted text-sm max-w-xs mb-8">
            Your {year} expense spreadsheet{selectedClients.size > 1 ? 's have' : ' has'} been saved to your device.
          </p>
          <button
            onClick={() => setDone(false)}
            className="px-6 py-2.5 rounded-xl bg-sb-green text-black font-semibold text-sm hover:brightness-110 transition"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">
      <header className="sticky top-0 z-20 bg-sb-bg border-b border-sb-border safe-top">
        <div className="px-4 py-3 max-w-2xl mx-auto w-full">
          <h1 className="text-base font-bold text-white text-center">Export</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-28 space-y-4 max-w-2xl mx-auto w-full overflow-y-auto">

        {/* Year picker + inline summary */}
        <div className="bg-sb-card border border-sb-border rounded-2xl p-4 space-y-3">
          <p className="text-xs text-sb-muted uppercase tracking-wider font-medium">Tax Year</p>
          <select
            value={year}
            onChange={e => handleYearChange(Number(e.target.value))}
            className="w-full bg-sb-card2 border border-sb-border rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sb-green transition appearance-none"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Inline summary for selected year */}
          {yearReceipts.length === 0 ? (
            <p className="text-sb-muted text-xs">No receipts for {year}.</p>
          ) : (
            <div className="rounded-xl bg-sb-card2 border border-sb-border px-3 py-2.5 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-sb-muted">Receipts</span>
                <span className="text-white">{yearReceipts.length}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-sb-muted">Total</span>
                <span className="text-sb-green">${yearReceipts.reduce((s, r) => s + r.total, 0).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Client filter */}
        {clientNames.length > 0 && (
          <div className="bg-sb-card border border-sb-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <User size={14} className="text-blue-400" />
                <p className="text-xs text-sb-muted uppercase tracking-wider font-medium">Filter by Client</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setSelectedClients(new Set(clientNames))} className="text-xs text-sb-green hover:underline">All</button>
                <button onClick={() => setSelectedClients(new Set())} className="text-xs text-sb-muted hover:underline">None</button>
              </div>
            </div>
            <p className="text-xs text-sb-muted mb-3 opacity-70">
              {selectedClients.size === 0
                ? 'No filter — exporting all clients'
                : `${selectedClients.size} client${selectedClients.size !== 1 ? 's' : ''} selected`}
            </p>
            <div className="space-y-1">
              {clientNames.map(name => {
                const checked = selectedClients.has(name);
                const label   = name || 'No Client';
                const count   = yearReceipts.filter(r => (r.clientName?.trim() || '') === name).length;
                return (
                  <button
                    key={name || '__none__'}
                    onClick={() => toggleClient(name)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition ${
                      checked ? 'border-blue-700 bg-blue-950/30' : 'border-sb-border hover:border-sb-muted'
                    }`}
                  >
                    <div
                      className="w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center"
                      style={{
                        borderColor: checked ? '#60a5fa' : '#555',
                        backgroundColor: checked ? 'rgba(96,165,250,0.15)' : 'transparent',
                      }}
                    >
                      {checked && (
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M1.5 5.5L4.5 8.5L9.5 2.5" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span className={`flex-1 text-sm ${checked ? 'text-white' : 'text-sb-muted'}`}>{label}</span>
                    <span className="text-xs text-sb-muted">{count} receipt{count !== 1 ? 's' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Format */}
        <div className="flex items-start gap-3 bg-sb-card border border-sb-border rounded-2xl p-4">
          <FileSpreadsheet size={20} className="text-sb-green flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-white text-sm font-medium">Excel (.xlsx)</p>
            <p className="text-sb-muted text-xs mt-0.5">
              Summary sheet + one sheet per category, sorted by date. Ready to hand to your accountant.
            </p>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <button
          onClick={handleDownload}
          disabled={exporting || exportReceipts.length === 0}
          className="w-full py-3.5 rounded-xl bg-sb-green text-black font-semibold disabled:opacity-40 hover:brightness-110 transition flex items-center justify-center gap-2"
        >
          {exporting ? 'Generating…' : <><Download size={18} /> Download Spreadsheet</>}
        </button>

      </main>
    </div>
  );
}

