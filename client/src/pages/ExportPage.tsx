import { useState } from 'react';
import { ArrowLeft, Download, Mail, CheckCircle, FileSpreadsheet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth, useAuthFetch } from '../contexts/AuthContext';
import { track } from '../lib/analytics';
import type { Receipt } from '../utils/types';

type Destination = 'download' | 'email';

export default function ExportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const authFetch = useAuthFetch();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [destination, setDestination] = useState<Destination>('download');
  const [emailTo, setEmailTo] = useState(user?.email ?? '');
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const { data: receipts = [] } = useQuery<Receipt[]>({
    queryKey: ['receipts'],
    queryFn: async () => {
      const res = await authFetch('/api/receipts');
      return res.ok ? res.json() : [];
    },
  });

  const yearReceipts = receipts.filter(r => r.receiptDate.startsWith(String(year)));
  const yearTotal    = yearReceipts.reduce((s, r) => s + r.total, 0);
  const categories   = new Set(yearReceipts.map(r => r.category));

  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

  async function handleExport() {
    setError('');
    setExporting(true);

    try {
      if (destination === 'download') {
        const res = await authFetch(`/api/export/download?year=${year}`);
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (user?.fullName || 'User').replace(/[^a-z0-9]/gi, '_');
        a.download = `Expenses_${year}_${safeName}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        track('export_generated', { year, destination: 'download', receipt_count: yearReceipts.length });
        setDone(true);
      } else {
        if (!emailTo.trim()) { setError('Enter recipient email'); setExporting(false); return; }
        const res = await authFetch('/api/export/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, to: emailTo.trim() }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Export failed');
        track('export_generated', { year, destination: 'email', receipt_count: yearReceipts.length });
        setDone(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">
      <header className="sticky top-0 z-20 bg-sb-bg border-b border-sb-border px-4 py-3 flex items-center gap-3 safe-top">
        <button onClick={() => navigate('/receipts')} className="p-2 -ml-2 text-sb-muted hover:text-white transition rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-bold text-white">Export</h1>
      </header>

      <main className="flex-1 px-4 py-6 space-y-5 max-w-lg mx-auto w-full">
        {done ? (
          <DoneState
            destination={destination}
            emailTo={emailTo}
            year={year}
            onReset={() => setDone(false)}
            onBack={() => navigate('/receipts')}
          />
        ) : (
          <>
            {/* Year picker */}
            <div className="bg-sb-card border border-sb-border rounded-2xl p-4">
              <p className="text-xs text-sb-muted uppercase tracking-wider font-medium mb-3">Tax Year</p>
              <div className="flex gap-2 flex-wrap">
                {years.map(y => (
                  <button
                    key={y}
                    onClick={() => { setYear(y); setDone(false); }}
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

            {/* Year summary */}
            <div className="bg-sb-card border border-sb-border rounded-2xl p-4">
              <p className="text-xs text-sb-muted uppercase tracking-wider font-medium mb-3">
                {year} Summary
              </p>
              {yearReceipts.length === 0 ? (
                <p className="text-sb-muted text-sm">No receipts found for {year}.</p>
              ) : (
                <div className="space-y-2">
                  <Row label="Receipts" value={String(yearReceipts.length)} />
                  <Row label="Categories" value={String(categories.size)} />
                  <Row label="Total expenses" value={`$${yearTotal.toFixed(2)}`} highlight />
                </div>
              )}
            </div>

            {/* Format note */}
            <div className="flex items-start gap-3 bg-sb-card border border-sb-border rounded-2xl p-4">
              <FileSpreadsheet size={20} className="text-sb-green flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white text-sm font-medium">Excel (.xlsx)</p>
                <p className="text-sb-muted text-xs mt-0.5">
                  Summary sheet + one sheet per category, sorted by date. Ready to hand to your accountant.
                </p>
              </div>
            </div>

            {/* Destination */}
            <div className="bg-sb-card border border-sb-border rounded-2xl p-4 space-y-3">
              <p className="text-xs text-sb-muted uppercase tracking-wider font-medium">Send To</p>
              <div className="grid grid-cols-2 gap-2">
                <DestButton
                  icon={<Download size={18} />}
                  label="Download"
                  sub="Save to device"
                  active={destination === 'download'}
                  onClick={() => setDestination('download')}
                />
                <DestButton
                  icon={<Mail size={18} />}
                  label="Email"
                  sub="Send to inbox"
                  active={destination === 'email'}
                  onClick={() => setDestination('email')}
                />
              </div>

              {destination === 'email' && (
                <div className="pt-1">
                  <label className="block text-xs text-sb-muted mb-1.5">Recipient email</label>
                  <input
                    type="email"
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    placeholder="accountant@example.com"
                    className="sb-input"
                  />
                </div>
              )}
            </div>

            {error && (
              <p className="text-sb-red text-sm bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button
              onClick={handleExport}
              disabled={exporting || yearReceipts.length === 0}
              className="w-full py-3.5 rounded-xl bg-sb-green text-black font-semibold disabled:opacity-40 hover:brightness-110 transition flex items-center justify-center gap-2"
            >
              {exporting
                ? 'Generating…'
                : destination === 'download'
                  ? <><Download size={18} /> Download Spreadsheet</>
                  : <><Mail size={18} /> Email Spreadsheet</>
              }
            </button>
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-sb-muted">{label}</span>
      <span className={highlight ? 'text-sb-green font-bold' : 'text-white'}>{value}</span>
    </div>
  );
}

function DestButton({
  icon, label, sub, active, onClick,
}: {
  icon: React.ReactNode; label: string; sub: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition ${
        active
          ? 'border-sb-green bg-green-950/20 text-sb-green'
          : 'border-sb-border text-sb-muted hover:border-sb-muted'
      }`}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs opacity-70">{sub}</span>
    </button>
  );
}

function DoneState({
  destination, emailTo, year, onReset, onBack,
}: {
  destination: Destination; emailTo: string; year: number;
  onReset: () => void; onBack: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-green-950/40 border border-green-800/40 flex items-center justify-center mb-5">
        <CheckCircle size={28} className="text-sb-green" />
      </div>
      <h2 className="text-white text-xl font-semibold mb-2">
        {destination === 'download' ? 'Downloaded!' : 'Email sent!'}
      </h2>
      <p className="text-sb-muted text-sm max-w-xs mb-8">
        {destination === 'download'
          ? `Your ${year} expense spreadsheet has been saved to your device.`
          : `Your ${year} expense spreadsheet was sent to ${emailTo}.`}
      </p>
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="px-4 py-2.5 rounded-xl border border-sb-border text-sb-muted hover:text-white transition text-sm"
        >
          Export another year
        </button>
        <button
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl bg-sb-green text-black font-semibold text-sm hover:brightness-110 transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}
