// Marketing landing page — the public front door for Scatterbrain Scanner.
// Requirements pulled from Alan's spec:
//   - Structure-first; copy is placeholder-and-tweak.
//   - Mobile-first responsive, dark aesthetic, Poppins headers.
//   - No dependency on any parent-brand (werkit/PaintBrain). Modular so it can
//     nest later.
//   - Prerequisite for Google OAuth verification (real homepage + privacy).
//
// Section stack (top → bottom):
//   1. Hero — headline, subhead, primary CTA "Try it now — no signup"
//   2. Interactive demo placeholder (phone mockup for v1; live demo later)
//   3. Pain contrast — old-way vs Scatterbrain
//   4. Features (5 cards)
//   5. Pricing (Free · Peace of Mind $4.99/mo — free during beta)
//   6. Founder note
//   7. Footer with privacy / terms links + support email

import { Link } from 'react-router-dom';
import {
  Zap,
  Sparkles,
  FileSpreadsheet,
  Lock,
  Users,
  ArrowRight,
  Camera,
  ChevronDown,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-sb-bg text-white">
      <TopNav />
      <Hero />
      <DemoSection />
      {/* <PainContrast /> — hidden, revisit later */}
      <Features />
      <Pricing />
      <FounderNote />
      <Footer />
    </div>
  );
}

// ── Top nav ────────────────────────────────────────────────────────────────

function TopNav() {
  return (
    <nav className="sticky top-0 z-40 bg-sb-bg/85 backdrop-blur-md border-b border-white/5">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
        <Link to="/landing" className="flex items-center gap-2.5">
          <img src="/sb-icon.png" alt="" className="w-8 h-8 rounded-lg" />
          <span className="text-white font-bold text-[15px] tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>
            Scatterbrain
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-white/70 hover:text-white transition text-sm">
            Sign in
          </Link>
          <Link
            to="/receipts"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-sb-green text-black text-sm font-semibold px-4 py-2 hover:brightness-110 transition"
          >
            Try free
            <ArrowRight size={14} strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient green glow behind hero */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[600px] pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% -10%, rgba(74,222,128,0.18), rgba(74,222,128,0) 60%)',
        }}
      />
      <div className="relative max-w-5xl mx-auto px-5 pt-16 pb-16 sm:pt-24 sm:pb-24 text-center">
        <img
          src="/sb-icon.png"
          alt="Scatterbrain Scanner"
          className="w-24 h-24 sm:w-28 sm:h-28 mx-auto mb-8 rounded-2xl shadow-2xl shadow-sb-green/10"
        />
        <h1
          className="text-white text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]"
          style={{ fontFamily: "'Poppins', sans-serif" }}
        >
          Snap it and forget it.
        </h1>
        <p className="mt-6 text-white/70 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
          Scatterbrain files every receipt automatically, then hands your accountant a clean
          spreadsheet — in one tap.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link
            to="/receipts"
            className="inline-flex items-center gap-2 rounded-full bg-sb-green text-black font-bold text-base px-6 py-3.5 hover:brightness-110 active:scale-[0.98] transition shadow-lg shadow-sb-green/20"
          >
            <Camera size={18} strokeWidth={2.5} />
            Try Scatterbrain free
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 text-white/80 hover:text-white hover:border-white/30 font-medium text-sm px-5 py-3 transition"
          >
            See how it works
            <ChevronDown size={14} />
          </a>
        </div>
        <p className="mt-5 text-white/40 text-xs">
          Free · Works on your phone · Backup free during beta
        </p>
      </div>
    </section>
  );
}

// ── App screenshots ────────────────────────────────────────────────────────

function DemoSection() {
  return (
    <section id="how-it-works" className="border-t border-white/5">
      <div className="max-w-5xl mx-auto px-5 py-16 sm:py-24">
        <div className="text-center mb-12">
          <p className="text-sb-green text-xs font-semibold uppercase tracking-wider mb-3">
            See it in action
          </p>
          <h2
            className="text-white text-3xl sm:text-4xl font-bold tracking-tight"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            Everything filed. Nothing lost.
          </h2>
          <p className="mt-3 text-white/60 text-base max-w-xl mx-auto">
            Your receipts, organized automatically — with the numbers ready when you need them.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 sm:gap-10 items-start max-w-3xl mx-auto">
          {/* Screenshot 1 — Receipt library */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-full rounded-[28px] overflow-hidden border border-white/10 shadow-2xl shadow-black">
              <img
                src="/screenshot-library.jpg"
                alt="Receipt library — every receipt filed by date and category"
                className="w-full block"
              />
            </div>
            <div className="text-center px-2">
              <p className="text-white text-sm font-semibold mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Every receipt, in one place
              </p>
              <p className="text-white/50 text-[13px] leading-relaxed">
                Auto-filed by store, category, and date. Search or filter any time.
              </p>
            </div>
          </div>

          {/* Screenshot 2 — Dashboard */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-full rounded-[28px] overflow-hidden border border-white/10 shadow-2xl shadow-black">
              <img
                src="/screenshot-dashboard.jpg"
                alt="Dashboard — spending by category with date range slider"
                className="w-full block"
              />
            </div>
            <div className="text-center px-2">
              <p className="text-white text-sm font-semibold mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Spending at a glance
              </p>
              <p className="text-white/50 text-[13px] leading-relaxed">
                Totals by category, any date range. Filter to exactly what your accountant needs.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mt-10">
          <Link
            to="/receipts"
            className="inline-flex items-center gap-2 rounded-full bg-sb-green text-black font-bold text-sm px-5 py-3 hover:brightness-110 active:scale-[0.98] transition shadow-lg shadow-sb-green/20"
          >
            Try it free
            <ArrowRight size={14} strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Pain contrast ──────────────────────────────────────────────────────────

function PainContrast() {
  return (
    <section className="border-t border-white/5 bg-white/[0.015]">
      <div className="max-w-5xl mx-auto px-5 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2
            className="text-white text-3xl sm:text-4xl font-bold tracking-tight"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            The old way is exhausting.
          </h2>
          <p className="mt-3 text-white/60 text-base max-w-2xl mx-auto">
            Most scanner apps make you file, tag, and organize each receipt yourself. That's fine
            for one. Terrible for a hundred.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <ContrastCard
            variant="bad"
            label="Old scanner apps"
            steps={[
              'Open the app',
              'Tap camera',
              'Snap the receipt',
              'Wait for OCR',
              'Pick a folder',
              'Type the name',
              'Save',
              'Tap back',
              'Tap camera again…',
            ]}
            footer="6-7 taps per receipt. Then do it 99 more times."
          />
          <ContrastCard
            variant="good"
            label="Scatterbrain"
            steps={[
              'Open the app',
              'Tap Scan',
              'Snap the receipt',
              'Confirm the details',
              'Done',
            ]}
            footer="Auto-extracted. Auto-categorized. Filed. Get back to your life."
          />
        </div>
      </div>
    </section>
  );
}

function ContrastCard({
  variant,
  label,
  steps,
  footer,
}: {
  variant: 'bad' | 'good';
  label: string;
  steps: string[];
  footer: string;
}) {
  const accent = variant === 'good' ? '#4ade80' : '#71717a';
  return (
    <div
      className="rounded-2xl border p-5 sm:p-6"
      style={{
        borderColor: variant === 'good' ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)',
        background: variant === 'good' ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.015)',
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-4"
        style={{ color: accent }}
      >
        {label}
      </p>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-baseline gap-3 text-sm">
            <span
              className="text-[10px] font-mono w-5 shrink-0"
              style={{ color: accent, opacity: 0.5 }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="text-white/80">{step}</span>
          </li>
        ))}
      </ol>
      <p className={`mt-5 pt-4 border-t text-[13px] ${variant === 'good' ? 'text-sb-green border-sb-green/20' : 'text-white/50 border-white/10'}`}>
        {footer}
      </p>
    </div>
  );
}

// ── Features ───────────────────────────────────────────────────────────────

function Features() {
  const features = [
    {
      icon: <Zap size={20} strokeWidth={2} />,
      color: '#e0725f',
      title: 'Zero learning curve',
      body: 'Open it and it just works. No manuals, no onboarding, no menus to memorize.',
    },
    {
      icon: <Sparkles size={20} strokeWidth={2} />,
      color: '#af7bd1',
      title: 'Smart auto-categorization',
      body: 'AI reads each receipt and files it in the right category automatically. You just confirm.',
    },
    {
      icon: <FileSpreadsheet size={20} strokeWidth={2} />,
      color: '#4ade80',
      title: 'One-click tax export',
      body: 'A clean Excel sheet for your bookkeeper or accountant — instead of a shoebox of paper.',
    },
    {
      icon: <Lock size={20} strokeWidth={2} />,
      color: '#5cb0c9',
      title: 'Your data, your privacy',
      body: 'Lives on your device and your own Google Drive. Not on our servers. You own it.',
    },
    {
      icon: <Users size={20} strokeWidth={2} />,
      color: '#d16b93',
      title: 'Split & share',
      body: 'Split a receipt with friends or an employer. Share a whole set with your accountant.',
    },
  ];

  return (
    <section className="border-t border-white/5">
      <div className="max-w-6xl mx-auto px-5 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2
            className="text-white text-3xl sm:text-4xl font-bold tracking-tight"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            Built for the way you actually work.
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 hover:bg-white/[0.03] transition"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ backgroundColor: f.color + '22', color: f.color }}
              >
                {f.icon}
              </div>
              <h3
                className="text-white text-base font-semibold mb-1.5"
                style={{ fontFamily: "'Poppins', sans-serif" }}
              >
                {f.title}
              </h3>
              <p className="text-white/60 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing ────────────────────────────────────────────────────────────────

function Pricing() {
  return (
    <section id="pricing" className="border-t border-white/5 bg-white/[0.015]">
      <div className="max-w-4xl mx-auto px-5 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2
            className="text-white text-3xl sm:text-4xl font-bold tracking-tight"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            Honest pricing.
          </h2>
          <p className="mt-3 text-white/60 text-base">
            Free to use. Cloud backup is free during beta.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <PricingCard
            tier="Free"
            price="$0"
            period=""
            highlight={false}
            perks={[
              'Unlimited scanning',
              'Auto-categorize + auto-file',
              'Excel tax export',
              'Split & share receipts',
              'Works fully offline',
              'Free to use, no credit card',
            ]}
            cta={{ label: 'Start using free', to: '/receipts' }}
          />
          <PricingCard
            tier="Peace of Mind"
            price="$4.99"
            period="/ month"
            highlight
            badge="Free during beta"
            perks={[
              'Everything in Free',
              'Google Drive cloud backup',
              'Multi-device sync',
              'Your data, still yours',
              'Priority support',
            ]}
            cta={{ label: 'Get peace of mind', to: '/receipts' }}
          />
        </div>
        {/* Placeholder for founding-member offer element (leave until offer is defined) */}
        {/* <p className="text-center mt-8 text-white/40 text-xs">
          Founding members get an extended free period. (offer details TBD)
        </p> */}
      </div>
    </section>
  );
}

function PricingCard({
  tier,
  price,
  period,
  perks,
  cta,
  highlight,
  badge,
}: {
  tier: string;
  price: string;
  period: string;
  perks: string[];
  cta: { label: string; to: string };
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 sm:p-7 flex flex-col ${
        highlight
          ? 'border-sb-green/40 bg-sb-green/[0.04]'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-baseline justify-between mb-1">
        <p
          className="text-white text-lg font-bold"
          style={{ fontFamily: "'Poppins', sans-serif" }}
        >
          {tier}
        </p>
        {badge && (
          <span className="text-[10px] uppercase tracking-wider font-semibold text-sb-green bg-sb-green/10 border border-sb-green/25 rounded-full px-2 py-0.5">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2 mb-6">
        <span className="text-white text-4xl font-bold" style={{ fontFamily: "'Poppins', sans-serif" }}>
          {price}
        </span>
        <span className="text-white/50 text-sm ml-1.5">{period}</span>
      </p>
      <ul className="space-y-2.5 mb-8 flex-1">
        {perks.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-white/75">
            <span className="text-sb-green mt-0.5 shrink-0">✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <Link
        to={cta.to}
        className={`w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold transition ${
          highlight
            ? 'bg-sb-green text-black hover:brightness-110'
            : 'border border-white/15 text-white hover:border-white/30 hover:bg-white/5'
        }`}
      >
        {cta.label}
        <ArrowRight size={14} strokeWidth={2.5} />
      </Link>
    </div>
  );
}

// ── Founder note ───────────────────────────────────────────────────────────

function FounderNote() {
  return (
    <section className="border-t border-white/5">
      <div className="max-w-3xl mx-auto px-5 py-16 sm:py-20 text-center">
        <p className="text-sb-green text-xs font-semibold uppercase tracking-wider mb-4">
          Built by a scatterbrain, for scatterbrains
        </p>
        <p className="text-white/80 text-lg sm:text-xl leading-relaxed">
          Every existing receipt app drove me nuts. Too many taps. Too many folders. Too much
          bookkeeping software pretending to be simple. I built the app I wished existed — one
          that gets out of the way so I can get on with my day.
        </p>
        <p className="mt-4 text-white/50 text-sm">— the founder</p>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black">
      <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <img src="/sb-icon.png" alt="" className="w-6 h-6 rounded-md opacity-80" />
          <span className="text-white/60 text-sm">
            © {new Date().getFullYear()} Scatterbrain Scanner
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Link to="/privacy" className="text-white/50 hover:text-white transition">
            Privacy
          </Link>
          <Link to="/terms" className="text-white/50 hover:text-white transition">
            Terms
          </Link>
          <a
            href="mailto:support@scatterbrainscanner.com"
            className="text-white/50 hover:text-white transition"
          >
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
