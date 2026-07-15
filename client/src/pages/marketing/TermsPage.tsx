// Terms of service — stub content. Prerequisite for Google OAuth
// verification. Real copy to be drafted by Alan / legal.

import { Link } from 'react-router-dom';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-sb-bg text-white">
      <MarketingNav />
      <main className="max-w-3xl mx-auto px-5 py-12 sm:py-20">
        <h1
          className="text-white text-3xl sm:text-4xl font-bold tracking-tight mb-2"
          style={{ fontFamily: "'Poppins', sans-serif" }}
        >
          Terms of Service
        </h1>
        <p className="text-white/50 text-sm mb-10">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="space-y-6 text-white/80 text-[15px] leading-relaxed">
          <p className="text-white/60 italic border-l-2 border-white/20 pl-4">
            Draft. This page will be updated with full terms before general release.
          </p>

          <Section title="1. Acceptance">
            <p>
              By using Scatterbrain Scanner, you agree to these terms. If you don't agree, please
              don't use the service.
            </p>
          </Section>

          <Section title="2. What Scatterbrain does">
            <p>
              Scatterbrain Scanner is a personal receipt scanning and organization tool for
              freelancers and self-employed users. We're not a bookkeeping service, not a tax
              advisor, and not a legal document management system. Use your own judgment for
              anything that matters for your taxes or finances.
            </p>
          </Section>

          <Section title="3. Your account">
            <p>
              You're responsible for keeping your login credentials secure. One account per person.
              Sharing credentials between multiple people is not supported and may break the
              app's data-safety guarantees.
            </p>
          </Section>

          <Section title="4. Your data">
            <p>
              Your receipts belong to you. We store them on your device and (if you connect) in
              your own cloud storage account. Deleting the app or clearing your browser removes
              local data. See the <Link to="/privacy" className="text-sb-green hover:underline">Privacy Policy</Link> for details.
            </p>
          </Section>

          <Section title="5. Payment (Peace of Mind plan)">
            <p>
              The Peace of Mind plan is $4.99/month and is free during our beta period. When
              paid plans launch, subscriptions are month-to-month; cancel any time and keep
              your data.
            </p>
          </Section>

          <Section title="6. Acceptable use">
            <p>
              Don't use Scatterbrain to store illegal content. Don't try to break our
              infrastructure. Don't attempt to access other users' data. If you find a security
              issue, please email us.
            </p>
          </Section>

          <Section title="7. No warranty">
            <p>
              Scatterbrain Scanner is provided "as is." We do our best to keep it reliable but
              can't guarantee zero downtime or zero bugs, especially during beta. Keep your own
              backups (Settings → Complete Backup is one tap).
            </p>
          </Section>

          <Section title="8. Changes to these terms">
            <p>
              We may update these terms occasionally. Continued use of the service after changes
              means you accept the updated terms. Material changes will be announced in-app or
              by email.
            </p>
          </Section>

          <Section title="9. Contact">
            <p>
              Questions: <a href="mailto:scatterbrainscanner@gmail.com" className="text-sb-green hover:underline">scatterbrainscanner@gmail.com</a>
            </p>
          </Section>
        </div>

        <div className="mt-14 pt-8 border-t border-white/10">
          <Link to="/landing" className="text-sb-green text-sm hover:underline">
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2
        className="text-white text-lg font-semibold mb-2"
        style={{ fontFamily: "'Poppins', sans-serif" }}
      >
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function MarketingNav() {
  return (
    <nav className="sticky top-0 z-40 bg-sb-bg/85 backdrop-blur-md border-b border-white/5">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
        <Link to="/landing" className="flex items-center gap-2.5">
          <img src="/sb-icon.png" alt="" className="w-8 h-8 rounded-lg" />
          <span className="text-white font-bold text-[15px]" style={{ fontFamily: "'Poppins', sans-serif" }}>
            Scatterbrain
          </span>
        </Link>
      </div>
    </nav>
  );
}
