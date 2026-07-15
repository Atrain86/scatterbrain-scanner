// Privacy policy — stub content. Prerequisite for Google OAuth verification.
// Real copy to be drafted by Alan / legal. Structure and required disclosures
// are here (data types, purposes, third-party sharing, retention, contact).
// Fill in the specifics; don't ship placeholder text to production without a
// real review pass.

import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-sb-bg text-white">
      <MarketingNav />
      <main className="max-w-3xl mx-auto px-5 py-12 sm:py-20">
        <h1
          className="text-white text-3xl sm:text-4xl font-bold tracking-tight mb-2"
          style={{ fontFamily: "'Poppins', sans-serif" }}
        >
          Privacy Policy
        </h1>
        <p className="text-white/50 text-sm mb-10">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-invert max-w-none space-y-6 text-white/80 text-[15px] leading-relaxed">
          <p className="text-white/60 italic border-l-2 border-white/20 pl-4">
            Draft. This page will be updated with a full policy before general release.
          </p>

          <Section title="1. What Scatterbrain Scanner is">
            <p>
              Scatterbrain Scanner is a local-first receipt scanning app. Your receipts and
              related data are stored on your device (in your browser's IndexedDB) and, optionally,
              in your own Google Drive or Dropbox account under your control.
            </p>
          </Section>

          <Section title="2. What data we collect">
            <ul className="list-disc pl-6 space-y-1.5">
              <li>Account email + hashed password (to sign in on other devices)</li>
              <li>Receipt content you scan (image + extracted line items) — stored on YOUR device and YOUR Drive, not on our servers</li>
              <li>Anonymous usage analytics (PostHog) — no receipt content, no personally identifying info beyond the account email</li>
            </ul>
          </Section>

          <Section title="3. Google Drive access">
            <p>
              If you connect Google Drive, Scatterbrain uses the <code>drive.file</code> scope only.
              We can read/write only files that Scatterbrain itself created in a dedicated folder in
              your Drive. We cannot see or touch any of your other Drive files.
            </p>
            <p>
              We use Google user data solely to back up and restore YOUR receipts. We do not
              share, sell, or use it for any other purpose.
            </p>
          </Section>

          <Section title="4. What we don't do">
            <ul className="list-disc pl-6 space-y-1.5">
              <li>We don't sell your data. Ever.</li>
              <li>We don't share your receipts with third parties.</li>
              <li>We don't advertise against your data.</li>
              <li>We don't scan your other cloud files.</li>
            </ul>
          </Section>

          <Section title="5. Third-party services we use">
            <ul className="list-disc pl-6 space-y-1.5">
              <li><strong>Google Cloud Vision</strong> — used to extract text from your receipt images (OCR). Images are sent to Google's API and not retained by Google beyond what's required to return a result.</li>
              <li><strong>OpenAI (GPT-4o)</strong> — used to parse the extracted text into structured line items and suggest a category. Text is processed and not retained by OpenAI beyond what's required to return a result.</li>
              <li><strong>Google Drive / Dropbox</strong> — only if you connect them, and only for backup files you control in your own account.</li>
              <li><strong>Resend</strong> — used to send emails when you share a receipt or export your data by email.</li>
              <li><strong>PostHog</strong> — anonymous usage analytics (no receipt content, no PII beyond account email).</li>
              <li><strong>Netlify + Render</strong> — hosting for the app and API.</li>
            </ul>
          </Section>

          <Section title="6. Data retention">
            <p>
              Local receipts live on your device until you delete them or clear your browser data.
              Cloud backups live in your Drive/Dropbox until you delete them. Deleting your
              account removes your login row from our server; your local + cloud copies are yours
              to manage.
            </p>
          </Section>

          <Section title="7. Your rights">
            <p>
              You can download a complete backup of your data at any time (Settings → Complete
              Backup). You can disconnect cloud storage at any time. You can request account
              deletion by emailing us.
            </p>
          </Section>

          <Section title="8. Contact">
            <p>
              Questions or requests: <a href="mailto:scatterbrainscanner@gmail.com" className="text-sb-green hover:underline">scatterbrainscanner@gmail.com</a>
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
