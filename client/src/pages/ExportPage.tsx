import { useState, useMemo } from 'react';
import { Download, CheckCircle, FileSpreadsheet, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthFetch } from '../contexts/AuthContext';
import type { Receipt } from '../utils/types';

export default function ExportPage() {
  const authFetch = useAuthFetch();

  const currentYear = new Date().getFullYear();
  const [year, setYear]               = useState(currentYear);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [exporting, setExporting]     = useState(false);
  const [done, setDone]               = useState(false);
  const [error, setError]             = useState('');

  const { data: receipts = [] } = useQuery<Receipt[]>({
    queryKey: ['receipts'],
    queryFn: async () => {
      const res = await authFetch('/api/receipts');
      return res.ok ? res.json() : [];
    },
  });

  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

  // Receipts for selected year
  const yearReceipts = useMemo(
    () => receipts.filter(r => r.receiptDate.startsWith(String(year))),
    [receipts, year]
  );

  // All unique client names used in this year (blank = "No Client")
  const clientNames = useMemo(() => {
    const names = new Set<string>();
    yearReceipts.forEach(r => names.add(r.clientName?.trim() || ''));
    return Array.from(names).sort((a, b) => {
      if (!a) return 1; // blank last
      if (!b) return -1;
      return a.localeCompare(b);
    });
  }, [yearReceipts]);

  // When year changes, reset client selection
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

  function selectAllClients() {
    setSelectedClients(new Set(clientNames));
  }

  function clearClients() {
    setSelectedClients(new Set());
  }

  // Receipts that will be exported (year + selected client filter)
  const exportReceipts = useMemo(() => {
    if (selectedClients.size === 0) return yearReceipts; // no filter = all
    return yearReceipts.filter(r => selectedClients.has(r.clientName?.trim() || ''));
  }, [yearReceipts, selectedClients]);

  const exportTotal = exportReceipts.reduce((s, r) => s + r.total, 0);

  async function handleDownload() {
    setError('');
    setExporting(true);

    try {
      // If specific clients selected, download once per client
      const targets = selectedClients.size > 0 ? Array.from(selectedClients) : [null];

      for (const client of targets) {
        const url = client !== null
          ? `/api/export/download?year=${year}&client=${encodeURIComponent(client)}`
          : `/api/export/download?year=${year}`;
        const res = await authFetch(url);
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        const suffix = client ? `_${client.replace(/[^a-z0-9]/gi, '_')}` : '';
        a.download = `Expenses_${year}${suffix}.xlsx`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      }
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-sb-bg flex flex-col">
        <header className="sticky top-0 z-20 bg-sb-bg border-b border-sb-border px-4 py-3 safe-top">
          <h1 className="text-base font-bold text-white text-center">Export</h1>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-6 pb-24">
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
      <header className="sticky top-0 z-20 bg-sb-bg border-b border-sb-border px-4 py-3 safe-top">
        <h1 className="text-base font-bold text-white text-center">Export</h1>
      </header>

      <main className="flex-1 px-4 py-4 pb-28 space-y-4 max-w-lg mx-auto w-full overflow-y-auto">

        {/* Year picker */}
        <div className="bg-sb-card border border-sb-border rounded-2xl p-4">
          <p className="text-xs text-sb-muted uppercase tracking-wider font-medium mb-3">Tax Year</p>
          <div className="flex gap-2 flex-wrap">
            {years.map(y => (
              <button
                key={y}
                onClick={() => handleYearChange(y)}
                className={`px-4 py-2 rounded-xl border text-sm font-medium transition ${
                  y === year
                    ? 'border-sb-green text-sb-green bg-green-950/30'
                    : 'border-sb-border text-sb-muted hover:border-sb-muted'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
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
                <button onClick={selectAllClients} className="text-xs text-sb-green hover:underline">All</button>
                <button onClick={clearClients} className="text-xs text-sb-muted hover:underline">None</button>
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
                const label = name || 'No Client';
                const count = yearReceipts.filter(r => (r.clientName?.trim() || '') === name).length;
                return (
                  <button
                    key={name || '__none__'}
                    onClick={() => toggleClient(name)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition ${
                      checked
                        ? 'border-blue-700 bg-blue-950/30'
                        : 'border-sb-border hover:border-sb-muted'
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

        {/* Summary */}
        <div className="bg-sb-card border border-sb-border rounded-2xl p-4">
          <p className="text-xs text-sb-muted uppercase tracking-wider font-medium mb-3">
            Export Summary
          </p>
          {exportReceipts.length === 0 ? (
            <p className="text-sb-muted text-sm">No receipts match your selection.</p>
          ) : (
            <div className="space-y-2">
              <SummaryRow label="Year" value={String(year)} />
              <SummaryRow label="Receipts" value={String(exportReceipts.length)} />
              {selectedClients.size > 0 && (
                <SummaryRow
                  label="Clients"
                  value={Array.from(selectedClients).map(c => c || 'No Client').join(', ')}
                />
              )}
              <SummaryRow label="Total" value={`$${exportTotal.toFixed(2)}`} highlight />
            </div>
          )}
        </div>

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
          <p className="text-sb-red text-sm bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
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

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-sb-muted">{label}</span>
      <span className={`${highlight ? 'text-sb-green font-bold' : 'text-white'} text-right max-w-[60%] truncate`}>{value}</span>
    </div>
  );
}
