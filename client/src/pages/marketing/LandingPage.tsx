import { useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const poppins = { fontFamily: "'Poppins', sans-serif" };

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white" style={poppins}>
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
    <nav className="sticky top-0 z-40 bg-black/85 backdrop-blur-md border-b border-white/5">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-end">
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
    <section className="relative overflow-hidden bg-black">
      <div className="relative max-w-5xl mx-auto px-5 pt-14 pb-14 sm:pt-20 sm:pb-20 text-center">
        <img
          src="/sb-logo-dark.jpg"
          alt="Scatterbrain Scanner"
          className="w-28 h-28 sm:w-36 sm:h-36 mx-auto mb-5 rounded-3xl"
        />
        <h1 className="text-white text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
          Scatterbrain Scanner
        </h1>
        <p className="mt-2 text-white/50 text-base sm:text-lg tracking-wide">
          Snap it and forget it.
        </p>
        <p className="mt-6 text-white/70 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
          A receipt scanning app for freelancers and self-employed people. Snap a photo and it
          automatically extracts the details, categorizes it, and files it. At tax time, export
          everything as a clean spreadsheet for your accountant.
        </p>
        <p className="mt-3 text-white/40 text-sm max-w-xl mx-auto leading-relaxed">
          Your receipts are stored on your own device. You can optionally back them up to your own
          Google Drive — Scatterbrain Scanner only accesses files it creates in your Drive, never
          anything else.
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
        <p className="mt-5 text-white/30 text-xs">
          Free · Works on your phone · Backup free during beta
        </p>
      </div>
    </section>
  );
}

// ── Screenshot carousel ────────────────────────────────────────────────────

const SLIDES: { src: string; alt: string; label: string; caption: string }[] = [
  {
    src: '/screenshot-library.jpg',
    alt: 'Receipt library',
    label: 'Every receipt, in one place',
    caption: 'Auto-filed by store, category, and date. Search or filter any time.',
  },
  {
    src: '/screenshot-dashboard.jpg',
    alt: 'Dashboard',
    label: 'Spending at a glance',
    caption: 'Totals by category, any date range. Filter to exactly what your accountant needs.',
  },
  {
    src: '/screenshot-lineitems.jpg',
    alt: 'Line item selector',
    label: 'Pick exactly what you claim',
    caption: 'Select individual line items and deselect anything personal — tax stays proportional.',
  },
  {
    src: '/screenshot-split.jpg',
    alt: 'Split receipt',
    label: 'Split receipts in seconds',
    caption: 'Choose items for a split, assign a client, save as a separate receipt automatically.',
  },
  {
    src: '/screenshot-categories.jpg',
    alt: 'Categories',
    label: 'Your categories, your colours',
    caption: 'Build the category list that matches how you work. Each gets its own colour.',
  },
];

// Show 2 per page on sm+, 1 on mobile
const PER_PAGE = 2;

function DemoSection() {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(SLIDES.length / PER_PAGE);
  const visibleSlides = SLIDES.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <section id="how-it-works" className="border-t border-white/5 bg-black">
      <div className="max-w-5xl mx-auto px-5 py-16 sm:py-24">
        <div className="text-center mb-12">
          <p className="text-sb-green text-xs font-semibold uppercase tracking-wider mb-3">
            See it in action
          </p>
          <h2 className="text-white text-3xl sm:text-4xl font-bold tracking-tight">
            Everything filed. Nothing lost.
          </h2>
          <p className="mt-3 text-white/60 text-base max-w-xl mx-auto">
            Your receipts, organized automatically — with the numbers ready when you need them.
          </p>
        </div>

        {/* Carousel */}
        <div className="relative">
          {/* Slides */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 items-start max-w-3xl mx-auto">
            {visibleSlides.map((slide) => (
              <div key={slide.src} className="flex flex-col items-center gap-4">
                <div className="w-full rounded-[28px] overflow-hidden border border-white/10 shadow-2xl shadow-black">
                  <img src={slide.src} alt={slide.alt} className="w-full block" />
                </div>
                <div className="text-center px-2">
                  <p className="text-white text-sm font-semibold mb-1">{slide.label}</p>
                  <p className="text-white/50 text-[13px] leading-relaxed">{slide.caption}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Chevron buttons */}
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Previous"
            className="absolute left-0 top-1/3 -translate-x-4 sm:-translate-x-8 -translate-y-1/2 w-10 h-10 rounded-full border border-white/15 bg-black flex items-center justify-center text-white/60 hover:text-white hover:border-white/40 disabled:opacity-20 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            aria-label="Next"
            className="absolute right-0 top-1/3 translate-x-4 sm:translate-x-8 -translate-y-1/2 w-10 h-10 rounded-full border border-white/15 bg-black flex items-center justify-center text-white/60 hover:text-white hover:border-white/40 disabled:opacity-20 disabled:cursor-not-allowed transition"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-label={`Page ${i + 1}`}
              className={`w-2 h-2 rounded-full transition-all ${
                i === page ? 'bg-sb-green w-5' : 'bg-white/25 hover:bg-white/50'
              }`}
            />
          ))}
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

// ── Pain contrast (hidden) ─────────────────────────────────────────────────

function PainContrast() {
  return (
    <section className="border-t border-white/5 bg-black">
      <div className="max-w-5xl mx-auto px-5 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2 className="text-white text-3xl sm:text-4xl font-bold tracking-tight">
            The old way is exhausting.
          </h2>
          <p className="mt-3 text-white/60 text-base max-w-2xl mx-auto">
            Most scanner apps make you file, tag, and organize each receipt yourself. That's fine
            for one. Terrible for a hundred.
          </p>
        </div>
      </div>
    </section>
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
    <section className="border-t border-white/5 bg-black">
      <div className="max-w-6xl mx-auto px-5 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2 className="text-white text-3xl sm:text-4xl font-bold tracking-tight">
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
              <h3 className="text-white text-base font-semibold mb-1.5">{f.title}</h3>
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
    <section id="pricing" className="border-t border-white/5 bg-black">
      <div className="max-w-4xl mx-auto px-5 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2 className="text-white text-3xl sm:text-4xl font-bold tracking-tight">
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
        <p className="text-white text-lg font-bold">{tier}</p>
        {badge && (
          <span className="text-[10px] uppercase tracking-wider font-semibold text-sb-green bg-sb-green/10 border border-sb-green/25 rounded-full px-2 py-0.5">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2 mb-6">
        <span className="text-white text-4xl font-bold">{price}</span>
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
    <section className="border-t border-white/5 bg-black">
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
          <img src="/sb-logo-dark.jpg" alt="" className="w-6 h-6 rounded-md opacity-80" />
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
            href="mailto:scatterbrainscanner@gmail.com"
            className="text-white/50 hover:text-white transition"
          >
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
