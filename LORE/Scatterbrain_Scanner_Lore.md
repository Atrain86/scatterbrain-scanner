# Scatterbrain Scanner — Lore Document

## What It Is

Scatterbrain Scanner is a standalone receipt scanning PWA and the first companion app in the PaintBrain ecosystem. It lets freelancers and small business owners scan receipts year-round, select which items are business expenses, auto-categorize them, and export a clean year-end tax summary. It is not a revenue product — it's an advertising and onboarding tool designed to pull users into PaintBrain.

The name "Scatterbrain Scanner" sits directly below the PaintBrain colorful brain logo, establishing immediate brand association. Every screen includes subtle "From the makers of PaintBrain" branding with a link.

---

## Strategic Purpose

Scatterbrain Scanner exists to solve the top-of-funnel problem for PaintBrain. PaintBrain is a full job management suite — most painters won't commit to changing their entire workflow based on a 4x6 card at a paint store counter. But every painter has a shoebox of receipts. A free receipt scanner with genuine utility gets them using a PaintBrain product daily with zero commitment.

The funnel: free receipt scanner → daily use → trust in the brand → "Want your receipts to flow into invoices? Try PaintBrain" → conversion.

Future companion apps (ColorShare for color matching, potentially others for trades) follow the same model. Each is a standalone tool that feeds the PaintBrain ecosystem. None are designed to generate revenue directly — they're customer acquisition tools where the AI costs are negligible (~$0.50 per 1,000 receipts).

---

## Core User Flow

1. User opens app, taps Scan
2. Camera opens, user photographs receipt
3. Compressed image sent to GPT-4o Mini via Express proxy at `/api/ocr/receipt`
4. AI returns structured JSON: store name, date, every line item with price, tax lines, and a suggested category
5. Modal shows all parsed items with checkboxes (all checked by default)
6. User unchecks personal items (coffee, lunch) — keeps business items
7. Tax lines auto-adjust proportionally based on selected items only
8. AI-suggested category shown — user confirms or changes
9. User taps Save
10. Receipt metadata + base64 image saved to IndexedDB (Dexie.js) locally on device
11. If Google Drive connected: receipt queued for silent upload to `Scatterbrain Scanner/receipts/{year}/{category}/`
12. Receipt appears in the scrollable receipt library

---

## Architecture — Zero Server Cost Design

The defining architectural decision is eliminating the backend entirely for the free tier. No persistent server, no database, no Postgres. This was driven by Alan's desire to test and use the app daily without ongoing infrastructure costs, and the realization that Google Drive (which users already pay for) can serve as persistent storage.

**Frontend:** React + Vite + TypeScript + Tailwind CSS, hosted on Netlify (free)

**AI Proxy:** Single Express route (`/api/ocr/receipt`) that receives compressed receipt image, calls GPT-4o Mini, returns parsed JSON. The route exists solely because the OpenAI API key cannot be exposed in browser code.

**Local Storage:** IndexedDB in the browser via Dexie.js stores all receipt metadata and base64 images. This is the primary data store. No login required — it's a single-user personal device app.

**File Storage:** Google Drive via OAuth. User connects once in Settings, app silently uploads receipt images to organized folders. Dropbox also supported. The AI has zero access to Drive — it only parses receipt images. The app's JavaScript uses the returned category string to route uploads.

**Critical clarification on the AI-to-Drive pipeline:** The AI receives a receipt image and returns structured data. The app's code then constructs a folder path from that data and uploads using the user's OAuth token. These are two completely independent operations — AI parsing and file storage never intersect.

**Email:** Resend via `/api/share/email` route. Reply-To set to user's email.

**Excel Export:** Generated entirely client-side using SheetJS — no server needed. Downloaded to device.

**Analytics:** PostHog with its own separate project token (not PaintBrain's).

---

## Receipt Scanning — Technical Detail

**Image compression:** Receipt photos are compressed client-side before sending. Server also runs sharp compression. A typical compressed receipt is 100-300KB.

**AI model:** GPT-4o Mini. Cost per receipt: approximately $0.0005 (half a cent).

**Parsing prompt:** Returns every line item as structured JSON, tax lines separately (GST, PST, HST), store name, date, and a category suggestion from the predefined list.

**Line-item selection:** All items pre-checked. User unchecks personal items. Tax is proportionally recalculated. Example: if selected items are 94.8% of the subtotal, each tax line is multiplied by 0.948.

**Category auto-suggestion:** AI prompt includes category list and store-to-category hints. User sees the suggestion pre-selected and can change with one tap.

---

## Expense Categories (as of v0.3.2)

Alan's real business expense categories, each with a color:

- Comm (teal) — phone, internet, communication bills
- Loan/Interest (red) — loan payments, credit interest
- Meals (green) — restaurants, food while working
- Medical (blue) — doctor, pharmacy, health
- Postage (orange) — stamps, shipping, couriers
- Supplies & Hardware (yellow) — hardware store, tools, materials
- AI Services (purple) — OpenAI, Claude, software subscriptions with AI
- Insurance (gray) — any insurance premiums
- Rent (blue) — office rent, storage
- Travel (cyan) — hotels, flights, transit
- Subscriptions (pink) — Netflix, SaaS, recurring software

Users can add custom categories. Categories stored in localStorage. AI auto-suggests based on store name and items.

**Migration note:** If a user's localStorage still has the old generic defaults (Supplies & Materials, Gas & Fuel, etc.), the app auto-migrates to the new list on first load.

---

## Receipt Library

Main screen. Scrollable list of all scanned receipts. Sortable by date (newest first). Filterable by category, date range, or search. Tap to expand: full line items, receipt photo, edit/delete/share actions.

**Share:** Email via Resend. Native share sheet (Web Share API). Recent recipients in localStorage.

---

## Year-End Export

User selects a year, generates Excel:

**Summary sheet:** Category | Receipts | Subtotal | Tax | Total. Grand total row.

**Category sheets:** One per category — Date | Store | Items | Subtotal | Tax | Total.

Generated client-side with SheetJS. Downloaded to device.

---

## Google Drive Integration — How It Works

User connects once in Settings via OAuth. Scope is `drive.file` — app can ONLY access files it created.

After connection, every receipt save queues a silent upload. `processCloudSyncQueue()` handles:
1. Token refresh if expired (via `/api/auth/google/refresh`)
2. `findOrCreateDriveFolder()` searches Drive API, creates folder if missing
3. `ensureReceiptFolder()` builds full path: `Scatterbrain Scanner/receipts/{year}/{category}/`
4. Uploads image file + JSON sidecar (metadata)
5. On success, removes item from queue. On failure, increments `attemptCount` + stores `lastError`.

Folder structure:
```
Scatterbrain Scanner/
└── receipts/
    └── 2025/
        ├── Meals/
        │   └── 2025-03-15_McDonalds_$14.32.jpg
        │   └── 2025-03-15_McDonalds_$14.32.json
        ├── Supplies & Hardware/
        │   └── 2025-03-20_HomeDepot_$87.50.jpg
        └── Travel/
            └── ...
```

If offline or token expired, items stay queued. Sync can be retried from Settings.

**Dropbox** uses the same naming convention but path-based: `/Scatterbrain Scanner/receipts/{year}/{category}/{filename}`.

---

## Server — What It Does (and Doesn't Do)

The Express server (`localhost:3002`) is intentionally minimal and stateless:

| Route | Purpose |
|-------|---------|
| `POST /api/ocr/receipt` | Proxy: compress image, call GPT-4o Mini, return JSON |
| `POST /api/share/email` | Send receipt email via Resend |
| `GET /api/health` | Status check |
| `GET /api/auth/google/init` | Redirect to Google OAuth consent screen |
| `GET /api/auth/google/callback` | Exchange code for tokens, postMessage to client popup |
| `POST /api/auth/google/refresh` | Refresh expired access token |
| `GET /api/auth/dropbox/init` | Redirect to Dropbox OAuth |
| `GET /api/auth/dropbox/callback` | Dropbox token exchange |
| `POST /api/auth/dropbox/refresh` | Refresh Dropbox token |

No database. No user storage. Restarts any time with no data loss.

---

## Current Build Status (v0.3.2 — 2026-05-14)

### Completed
- Full IndexedDB migration (Dexie.js)
- ScanModal, Receipt Library, Dashboard, Export all read/write IndexedDB
- Google Drive + Dropbox OAuth flow (server as stateless relay)
- Drive folder structure with `findOrCreateDriveFolder` + `ensureReceiptFolder`
- Cloud sync queue with retry tracking
- User's 11 real categories + legacy migration
- Client-side Excel export (SheetJS)
- Email sharing (Resend)
- Bundle splitting (index.js ~94KB, xlsx/dexie in separate chunks)
- PWA manifest + service worker

### Pending / Known Gaps
- **Auto-sync on scan** — `enqueueReceiptSync()` is called but `processCloudSyncQueue()` is NOT triggered automatically after save. User must tap "Sync Now" in Settings. Fix: call `processCloudSyncQueue()` in ScanModal after successful save when a provider is connected.
- **Google Drive end-to-end test** — credentials in place, server needs restart, flow not yet confirmed working by Alan.
- **Dropbox credentials** — `DROPBOX_APP_KEY` + `DROPBOX_APP_SECRET` blank in `server/.env`. Dropbox OAuth non-functional.
- **Resend API key** — `RESEND_API_KEY` blank. Email sharing non-functional.
- **PWA icons** — placeholders, no real brain logo assets.
- **CLAUDE.md progress** — phase table not updated for v0.3.2 work.

---

## Pricing Model

**Free tier:** Full scanning, categorization, local storage. Data on device only.

**Cloud tier (~$2/month):** Connect Google Drive or Dropbox. Auto-sync every receipt.

**Pro tier (~$4/month, future):** Multi-device sync, team sharing, advanced export.

Revenue is not the goal. Pricing covers AI costs and creates perceived value.

---

## Monthly Operating Costs

| Item | Cost |
|------|------|
| Netlify hosting + functions | $0 (free tier) |
| Google Drive storage | $0 (user's own plan) |
| AI costs per 100 users | ~$4/month |
| PostHog analytics | $0 (free tier) |
| Resend email | $0 (free tier) |
| **Total** | **~$4/month** |

---

## Relationship to PaintBrain Ecosystem

Scatterbrain Scanner is the first of potentially several companion apps:

- **Scatterbrain Scanner** — receipt scanning and tax categorization (this app)
- **ColorShare** — color matching and sharing with clients (planned)
- **Future trade-specific tools** — punch clock, material calculator, etc.

All share the PaintBrain brain logo, dark theme aesthetic, and design language. All are standalone, independently useful, and subtly funnel users toward PaintBrain.

Future data pipeline: when a Scatterbrain Scanner user joins PaintBrain, scanned receipts could migrate into expense records tied to clients and invoices. Not built yet, but data formats are compatible by design.
