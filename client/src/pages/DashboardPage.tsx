import { useMemo } from 'react';
import { ArrowLeft, TrendingUp, Receipt, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useReceipts } from '../hooks/useReceipts';
import { getCategoryColor } from '../utils/types';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { receipts, isLoading } = useReceipts();

  const now       = new Date();
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();

  const stats = useMemo(() => {
    const monthReceipts = receipts.filter(r => {
      const d = new Date(r.receiptDate + 'T00:00:00');
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const yearReceipts = receipts.filter(r => r.receiptDate.startsWith(String(thisYear)));

    const monthTotal = monthReceipts.reduce((s, r) => s + r.total, 0);
    const yearTotal  = yearReceipts.reduce((s, r) => s + r.total, 0);

    const byCat: Record<string, number> = {};
    yearReceipts.forEach(r => {
      byCat[r.category] = (byCat[r.category] ?? 0) + r.total;
    });

    const categoryData = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => ({ name, total, color: getCategoryColor(name) }));

    const topCategory = categoryData[0]?.name ?? null;
    const recent = [...receipts].slice(0, 5);

    return {
      monthTotal, monthCount: monthReceipts.length,
      yearTotal,  yearCount:  yearReceipts.length,
      categoryData, topCategory, recent,
    };
  }, [receipts, thisMonth, thisYear]);

  const monthName = now.toLocaleString('en-CA', { month: 'long' });

  return (
    <div className="min-h-screen bg-sb-bg flex flex-col">
      <header className="sticky top-0 z-20 bg-sb-bg border-b border-sb-border safe-top">
        <div className="px-4 py-3 flex items-center gap-3 max-w-2xl mx-auto w-full">
          <button onClick={() => navigate('/receipts')} className="p-2 -ml-2 text-sb-muted hover:text-white transition rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-bold text-white">Dashboard</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 pb-32 max-w-2xl mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-sb-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={monthName}
                value={`$${stats.monthTotal.toFixed(2)}`}
                sub={`${stats.monthCount} receipt${stats.monthCount !== 1 ? 's' : ''}`}
                icon={<Receipt size={16} />}
                accent="green"
              />
              <StatCard
                label={`${thisYear} Total`}
                value={`$${stats.yearTotal.toFixed(2)}`}
                sub={`${stats.yearCount} receipt${stats.yearCount !== 1 ? 's' : ''}`}
                icon={<TrendingUp size={16} />}
                accent="purple"
              />
            </div>

            {stats.topCategory && (
              <div className="bg-sb-card border border-sb-border rounded-2xl p-4 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: getCategoryColor(stats.topCategory) + '22' }}
                >
                  <Tag size={18} style={{ color: getCategoryColor(stats.topCategory) }} />
                </div>
                <div>
                  <p className="text-xs text-sb-muted">Top category this year</p>
                  <p className="text-white font-semibold text-sm">{stats.topCategory}</p>
                </div>
                <span className="ml-auto text-base font-bold" style={{ color: getCategoryColor(stats.topCategory) }}>
                  ${stats.categoryData[0]?.total.toFixed(2)}
                </span>
              </div>
            )}

            {stats.categoryData.length > 0 && (
              <div className="bg-sb-card border border-sb-border rounded-2xl p-4">
                <p className="text-xs text-sb-muted uppercase tracking-wider font-medium mb-4">
                  {thisYear} — by category
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.categoryData} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#888', fontSize: 10 }}
                      tickFormatter={name => name.split(' ')[0]}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#888', fontSize: 10 }}
                      tickFormatter={v => `$${v}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a2e',
                        border: '1px solid #333',
                        borderRadius: 12,
                        color: '#fff',
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Total']}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {stats.categoryData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {stats.recent.length > 0 && (
              <div className="bg-sb-card border border-sb-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-sb-border">
                  <p className="text-xs text-sb-muted uppercase tracking-wider font-medium">Recent</p>
                </div>
                {stats.recent.map(r => {
                  const catColor = getCategoryColor(r.category);
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-sb-border last:border-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{r.storeName}</p>
                        <p className="text-sb-muted text-xs">{r.receiptDate}</p>
                      </div>
                      <span className="text-sb-green text-sm font-semibold flex-shrink-0">
                        ${r.total.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
                <button
                  onClick={() => navigate('/receipts')}
                  className="w-full px-4 py-3 text-xs text-sb-muted hover:text-white transition text-center"
                >
                  View all receipts →
                </button>
              </div>
            )}

            {receipts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sb-muted text-sm">No receipts yet. Scan one to see your dashboard.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; accent: 'green' | 'purple';
}) {
  const color = accent === 'green' ? '#4ade80' : '#a855f7';
  return (
    <div className="bg-sb-card border border-sb-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs text-sb-muted">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-sb-muted mt-0.5">{sub}</p>
    </div>
  );
}
