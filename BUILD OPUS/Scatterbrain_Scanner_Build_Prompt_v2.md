# Scatterbrain Scanner — Claude Code Build Prompt (v2)

## Overview

We're building a standalone receipt scanning PWA called **Scatterbrain Scanner**. It's a companion app to PaintBrain — a simple, mobile-first tool for freelancers and small business owners to scan receipts, select business items, auto-categorize expenses, and export year-end tax summaries.

The receipt scanning, line-item selection, and proportional tax calculation logic already exist inside PaintBrain. Your first job is to extract that code and build a standalone app around it.

**PaintBrain codebase location:** `/Users/atrain/Documents/AI_LOCAL/PB_RBUILD_MOA/`

Read PaintBrain's receipt scanning code before starting. **Do NOT modify PaintBrain's codebase.** Extract and copy what you need into the new project.

---

## Critical Architecture Decision: Zero Backend

This app has NO traditional backend server. No Render. No Postgres. No persistent server process.

- **Frontend + PWA:** Hosted on Netlify (free)
- **AI parsing:** Single Netlify Function proxies receipt images to GPT-4o Mini and returns parsed JSON
- **Email sharing:** Second Netlify Function sends emails via Resend
- **Local data:** IndexedDB in the browser stores all receipt metadata
- **File storage:** Google Drive and/or Dropbox via OAuth (user's own cloud storage)
- **Excel export:** Generated client-side in the browser using SheetJS
- **Analytics:** PostHog (separate project from PaintBrain — do NOT reuse PaintBrain's token)

The AI never touches Google Drive or Dropbox. The AI receives a receipt image and returns structured JSON. The app's JavaScript code handles all file routing to cloud storage using the user's OAuth tokens. These are two completely independent operations.

---

## Project Setup

Create a new project directory at `/Users/atrain/Documents/AI_LOCAL/SCATTERBRAIN_SCANNER/`

### Project Structure
```
SCATTERBRAIN_SCANNER/
├── src/
│   ├── components/
│   │   ├── ReceiptScanner.tsx
│   │   ├── LineItemSelector.tsx
│   │   ├── CategoryPicker.tsx
│   │   ├── ReceiptCard.tsx
│   │   ├── ReceiptLibrary.tsx
│   │   ├── ShareModal.tsx
│   │   ├── ExportScreen.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Settings.tsx
│   │   ├── Auth.tsx
│   │   └── HelpTip.tsx
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   └── DriveContext.tsx
│   ├── utils/
│   │   ├── db.ts (IndexedDB wrapper)
│   │   ├── drive.ts (Google Drive API helpers)
│   │   ├── dropbox.ts (Dropbox API helpers)
│   │   ├── imageCompression.ts
│   │   ├── taxCalculation.ts
│   │   └── formatters.ts
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── LandingPage.tsx
│   │   └── ExportPage.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── netlify/
│   └── functions/
│       ├── parse-receipt.ts
│       └── send-email.ts
├── public/
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── .env.example
├── CLAUDE.md
└── README.md
```

### Environment Variables (.env.example)
```
# OpenAI (for receipt parsing via Netlify Function)
OPENAI_API_KEY=

# Resend (for email sharing via Netlify Function)
RESEND_API_KEY=

# Google Drive OAuth (set in Netlify dashboard for functions, used client-side for uploads)
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_REDIRECT_URI=

# Dropbox OAuth
VITE_DROPBOX_APP_KEY=
VITE_DROPBOX_REDIRECT_URI=

# PostHog (SEPARATE project from PaintBrain)
VITE_POSTHOG_API_KEY=
VITE_POSTHOG_HOST=
```

Note: Google Client Secret and Dropbox App Secret go in Netlify dashboard environment variables only (server-side functions), NOT in the frontend .env with VITE_ prefix. OAuth token exchange must happen in a Netlify Function to keep secrets safe.

Before you start coding, tell me the exact redirect URIs you need for Google and Dropbox OAuth so I can register them while you build.

---

## PHASE 1: Project Scaffold + Auth + Extracted Receipt Scanner

### 1A: Project Scaffold

- Initialize React + Vite + TypeScript + Tailwind project
- Set up the folder structure above
- Configure Tailwind with dark theme matching PaintBrain's aesthetic
- Set up the PWA manifest with the PaintBrain brain logo, app name "Scatterbrain Scanner", dark theme colors, display: standalone
- Create a basic service worker for offline capability
- Set up PostHog snippet in main.tsx (reads from VITE_POSTHOG_API_KEY)

### 1B: Auth System

Simple email/password auth stored entirely in IndexedDB. No server-side auth for the free tier.

- Sign up: email, password, full name, business name (optional)
- Sign in: email + password
- Password hashed client-side using a library like bcryptjs before storing
- Auth state managed in AuthContext
- JWT-like session token stored in localStorage for session persistence
- Every IndexedDB operation scoped to the authenticated user's email/ID

**Important:** This is local-only auth for now. There is no server to validate against. The auth exists to scope data in IndexedDB so multiple people could theoretically use the same device. When the Pro tier with Render backend is added later, this migrates to server-validated auth.

### 1C: IndexedDB Storage Layer

Create a clean IndexedDB wrapper (`utils/db.ts`) that handles all local storage:

**Stores (tables) needed:**
- `users` — email, hashedPassword, fullName, businessName, phone, settings (JSON), createdAt
- `receipts` — id (auto-increment), userEmail, storeName, receiptDate, subtotal, taxAmount, total, category, lineItems (JSON array), taxLines (JSON array), imageBlob (the compressed receipt image), driveFileId (nullable), dropboxPath (nullable), notes, createdAt, updatedAt
- `categories` — id, userEmail, name, color, isDefault (boolean), sortOrder
- `recentRecipients` — userEmail, email, lastUsed
- `settings` — userEmail, defaultCategory, defaultExportFormat, googleConnected, dropboxConnected, defaultInvoiceMessage, defaultEstimateMessage

**The wrapper should provide clean async methods:**
- `db.receipts.add(receipt)` → returns id
- `db.receipts.getAll(userEmail)` → returns all receipts for user
- `db.receipts.getById(id)` → returns single receipt
- `db.receipts.update(id, changes)` → updates receipt
- `db.receipts.delete(id)` → removes receipt
- `db.receipts.search(userEmail, query)` → search by store name or item description
- `db.receipts.getByCategory(userEmail, category)` → filter by category
- `db.receipts.getByDateRange(userEmail, startDate, endDate)` → filter by date
- Same pattern for categories, settings, recentRecipients

### 1D: Extract Receipt Scanner from PaintBrain

Go to PaintBrain's codebase and find:
- The receipt photo capture and camera access logic
- The image compression utility
- The OpenAI Vision API call that parses receipt images into line items
- The line-item selector modal with checkboxes
- The proportional tax calculation logic for selected items
- Any currency formatting utilities

Extract all of this into the new project. Adapt:
- Replace any PaintBrain-specific imports, contexts, or API calls
- Remove any references to clients/projects — receipts here are standalone
- The OpenAI API call moves to a Netlify Function (see 1E) instead of a backend route
- Keep the same UX: scan → compress → parse → select items → save

### 1E: Netlify Function — Receipt Parsing

Create `netlify/functions/parse-receipt.ts`:

- Receives a base64-encoded compressed receipt image in the request body
- Calls GPT-4o Mini (not GPT-4o — we want the cheapest model that handles OCR)
- The prompt instructs the model to return JSON with:
  - storeName (string)
  - date (string, YYYY-MM-DD format)
  - lineItems (array of {description: string, amount: number, isTax: boolean})
  - suggestedCategory (string — one of the predefined categories, based on store name and items)
- Returns the parsed JSON to the frontend
- Error handling: if parsing fails, return a structured error that the frontend can show as "Couldn't read this receipt — try a clearer photo or enter manually"
- Rate limiting: basic check to prevent abuse (optional for now)

**The prompt for GPT-4o Mini should include:**
```
You are a receipt parser. Analyze this receipt image and return ONLY valid JSON with no other text.

Return this exact structure:
{
  "storeName": "the store or business name",
  "date": "YYYY-MM-DD",
  "lineItems": [
    {"description": "item name", "amount": 12.99, "isTax": false},
    {"description": "GST", "amount": 1.46, "isTax": true}
  ],
  "suggestedCategory": "one of: Supplies & Materials, Gas & Fuel, Vehicle & Auto, Equipment & Tools, Meals & Entertainment, Office Supplies, Subcontractors, Insurance, Phone & Internet, Other"
}

Rules:
- Every line item on the receipt gets its own entry
- Tax lines (GST, PST, HST, sales tax, VAT) have isTax: true
- Subtotals and totals are NOT line items — skip them
- suggestedCategory is your best guess based on the store name and items:
  - Hardware stores, paint stores, building supply → Supplies & Materials
  - Gas stations → Gas & Fuel
  - Auto parts, mechanics → Vehicle & Auto
  - Tool stores → Equipment & Tools
  - Restaurants, cafes, fast food → Meals & Entertainment
  - Office supply stores → Office Supplies
  - Phone/internet bills → Phone & Internet
  - If unsure → Other
- If you cannot read the receipt clearly, return: {"error": "Could not parse receipt"}
```

### 1F: Scan → Parse → Select → Save Flow

Wire the complete flow together:

1. User taps Scan button → camera opens (or photo library picker on iOS)
2. Image captured → compressed to ~200-300KB using the extracted compression utility
3. Loading state shown: "Reading receipt..."
4. Compressed image sent as base64 to the parse-receipt Netlify Function
5. Function returns parsed JSON
6. **Line Item Selector modal opens** showing:
   - Store name and date at top (editable if AI got it wrong)
   - All line items with checkboxes (all checked by default)
   - Tax lines shown separately below, not checkable — auto-calculated
   - AI-suggested category shown as a dropdown, pre-selected — user can change
   - Running total at bottom that updates as items are checked/unchecked
   - Tax proportionally recalculated when items change (same logic as PaintBrain)
   - "Save" button at bottom
7. User unchecks personal items, confirms category, taps Save
8. Receipt saved to IndexedDB with all metadata + the compressed image blob
9. Receipt appears in the library
10. If Google Drive is connected, image silently uploads in background (Phase 3)

### 1G: Receipt Library — Basic Version

The main screen after sign-in. For Phase 1, keep it simple:

- Scrollable list of all receipts, newest first
- Each row shows: store name (bold), date, total amount, category badge (color-coded pill)
- Tap to expand: shows line items, receipt photo (from IndexedDB blob), edit and delete buttons
- Delete requires confirmation
- Empty state: "No receipts yet. Tap + to scan your first one."
- Floating action button (bottom right) with camera icon to start a new scan

### 1H: Branding

- **Sign-in screen:** PaintBrain brain logo (the colorful paint-splatter brain) centered at top, "Scatterbrain Scanner" text directly below it, sign-in form below
- **App header:** Small brain logo + "Scatterbrain" text in the header bar
- **Color scheme:** Dark theme matching PaintBrain — same dark backgrounds, card styles, accent colors
- **Throughout:** "From the makers of PaintBrain" in footer/about areas

**Show me everything from Phase 1 before moving to Phase 2.**

---

## PHASE 2: Category System + Receipt Library Upgrade

### 2A: Pre-Built Categories

Seed the IndexedDB categories store with defaults on first sign-up:

| Category | Color | 
|----------|-------|
| Supplies & Materials | #F97316 (orange) |
| Gas & Fuel | #EF4444 (red) |
| Vehicle & Auto | #3B82F6 (blue) |
| Equipment & Tools | #EAB308 (yellow) |
| Meals & Entertainment | #22C55E (green) |
| Office Supplies | #A855F7 (purple) |
| Subcontractors | #06B6D4 (cyan) |
| Insurance | #6B7280 (gray) |
| Phone & Internet | #14B8A6 (teal) |
| Other | #9CA3AF (neutral) |

All marked as `isDefault: true` — cannot be deleted, can be hidden.

### 2B: Custom Categories

In Settings, a "Categories" section:
- List of all categories with color swatches
- "Add Category" button — name field + color picker
- Custom categories can be deleted, defaults can only be hidden/shown
- Reorder by drag (nice to have, not required for Phase 2)

### 2C: Category Picker in Scanner Flow

When the line-item selector modal shows the AI-suggested category:
- Display as a dropdown/select populated with all categories (defaults + custom)
- AI suggestion pre-selected
- Color-coded pills or swatches next to each option
- User changes with one tap if needed

### 2D: Receipt Library — Full Version

Upgrade the basic library from Phase 1:

**Filter bar at top:**
- Category filter: pill toggles for each category, tap to filter. "All" selected by default
- Date filter: "This Month" / "This Year" / "Custom Range" selector
- Search bar: search by store name or item description

**Receipt cards updated:**
- Category color as left border on each card (same pattern as PaintBrain document cards)
- Tap to expand shows full line items with the receipt photo

**Batch actions:**
- "Select" toggle in the header (same pattern as PaintBrain's client select mode)
- Checkboxes appear on each card
- Bottom action bar appears: "Share Selected" / "Delete Selected" / "Export Selected"
- Share and export are wired in later phases — for now, just build the selection UI

**Show me Phase 2 before moving to Phase 3.**

---

## PHASE 3: Google Drive + Dropbox Integration

### 3A: Google Drive OAuth

**You need a Netlify Function for the token exchange** because the Google Client Secret cannot be in frontend code.

Create `netlify/functions/google-auth-callback.ts`:
- Receives the authorization code from Google's OAuth redirect
- Exchanges it for access token + refresh token using the Client Secret (stored in Netlify environment variables)
- Returns both tokens to the frontend

**Frontend flow:**
1. User taps "Connect Google Drive" in Settings
2. App redirects to Google's OAuth consent screen with scope `https://www.googleapis.com/auth/drive.file` and `access_type=offline` and `prompt=consent`
3. User authorizes, Google redirects back to the app with a code
4. App sends code to the google-auth-callback Netlify Function
5. Function exchanges code for tokens, returns them
6. App stores tokens in IndexedDB settings
7. Settings shows "Connected: user@gmail.com" with a Disconnect button

**Token refresh:**
- Access tokens expire every hour
- Before any Drive API call, check if the token is expired
- If expired, create another Netlify Function `netlify/functions/google-refresh-token.ts` that uses the refresh token + Client Secret to get a new access token
- Update the stored access token in IndexedDB
- If refresh fails (user revoked access), show "Google Drive disconnected — reconnect in Settings"

**Drive utilities (`utils/drive.ts`):**

```typescript
// Check if folder exists, create if not
async function ensureFolder(accessToken, parentId, folderName) → folderId

// Build the full folder path: Scatterbrain Scanner / 2025 / Category
async function ensureReceiptFolder(accessToken, year, category) → folderId

// Upload receipt image to the correct folder
async function uploadReceipt(accessToken, folderId, fileName, imageBlob) → fileId

// Delete a file
async function deleteFromDrive(accessToken, fileId)
```

### 3B: Silent Upload on Save

After a receipt is saved to IndexedDB (end of the scan flow):
- If Google Drive is connected, immediately call `uploadReceipt` in the background
- Folder path: `Scatterbrain Scanner/{year}/{category}/`
- File name: `{date}_{storeName}_{total}.jpg` (sanitize special characters)
- Store the returned Drive file ID in the receipt's IndexedDB record
- If upload fails (offline, token expired), queue it for retry
- Show no UI for this — it's completely silent. The user tapped Save and they're done.

**Upload queue for offline/failed uploads:**
- Store failed uploads in an IndexedDB queue: `pendingUploads` store
- On app open and periodically (every 5 minutes), check the queue and retry
- When successful, update the receipt record with the Drive file ID and remove from queue

### 3C: Dropbox OAuth

Same pattern as Google Drive but with Dropbox's API:

Create `netlify/functions/dropbox-auth-callback.ts` for token exchange.

**Frontend flow:**
1. User taps "Connect Dropbox" in Settings
2. Redirect to Dropbox OAuth with scope for file access
3. User authorizes, redirects back with code
4. Netlify Function exchanges code for tokens
5. Tokens stored in IndexedDB

**Dropbox utilities (`utils/dropbox.ts`):**
- Create folder if not exists
- Upload file to folder
- Delete file
- Folder path: `/Scatterbrain Scanner/{year}/{category}/`
- Same file naming convention as Google Drive

### 3D: Upload Destination Setting

In Settings, a "Cloud Storage" section:
- Google Drive: Connect / Connected (email) / Disconnect
- Dropbox: Connect / Connected / Disconnect
- If both connected, a "Primary" toggle to choose which gets uploads
- If neither connected, receipts stay local only with a note: "Connect cloud storage to back up your receipts"

### 3E: Re-categorization Updates Drive/Dropbox

If a user changes a receipt's category after it's been uploaded:
- Move the file in Google Drive / Dropbox from the old category folder to the new one
- Update the file ID / path in IndexedDB
- Do this silently in the background

**Show me Phase 3 before moving to Phase 4.**

---

## PHASE 4: Share Receipts

### 4A: Netlify Function — Send Email

Create `netlify/functions/send-email.ts`:
- Receives: recipient email, subject, body text, receipt image as base64 attachment
- Sends via Resend from `receipts@scatterbrainscanner.com` (or `noreply@paintbrainapp.com` — we'll decide)
- Reply-To set to the user's email from their profile
- Returns success/failure

### 4B: Share Individual Receipt

On each expanded receipt card, add a "Share" button. Tapping opens a share modal:

**Email option:**
- Input field for recipient email
- Quick-select chips showing recent recipients (from IndexedDB recentRecipients store)
- Pre-filled subject: "Receipt from [Store Name] — [Date]"
- Pre-filled body: "Here's a receipt from [Store Name] for $[Total]."
- User can edit subject and body before sending
- Sends receipt image as attachment via the send-email Netlify Function
- Save recipient to recentRecipients after successful send

**Native share option:**
- "Share via..." button that uses the Web Share API
- `navigator.share({ files: [receiptImageFile], title: 'Receipt from Store', text: '$Total' })`
- This opens the phone's native share sheet — iMessage, WhatsApp, SMS, AirDrop, whatever
- Works on iOS and Android
- Falls back gracefully if Web Share API isn't supported (show email-only)

### 4C: Share Multiple Receipts

When in Select mode (from Phase 2's batch actions):
- "Share Selected" button in the bottom action bar
- Opens the same share modal but sends all selected receipt images as attachments in one email
- For native share: shares multiple files if supported, or shares a zip file

### 4D: Recent Recipients

- Store last 10 unique email addresses per user in IndexedDB
- Show as tappable chips at the top of the share modal email field
- Tap to auto-fill the email
- Sorted by most recently used

**Show me Phase 4 before moving to Phase 5.**

---

## PHASE 5: Year-End Export

### 5A: Export Screen

Accessible from a button in the header or navigation: "Export" icon.

**Configuration:**
- Year selector dropdown (populated from years that have receipts)
- Format toggle: Excel (.xlsx) or CSV
- Destination: "Download" / "Google Drive" / "Dropbox" / "Email"
  - Only show Google Drive / Dropbox if connected
  - Email opens a recipient input field
- "Generate Export" button

### 5B: Excel Generation (Client-Side)

Use SheetJS (xlsx library) — runs entirely in the browser, no server needed.

Install: `npm install xlsx`

**Summary sheet (first sheet, named "Summary"):**
- Row 1: "Expense Summary — [Year]" (bold, merged across columns)
- Row 2: "[User's Full Name] — [Business Name]" (if set)
- Row 3: blank
- Row 4: Headers: Category | Receipts | Subtotal | Tax | Total
- Rows 5+: One row per category that has receipts in that year
- Bottom row: Grand Total (bold)
- Format: currency columns with $ and 2 decimal places, bold headers

**One sheet per category (only categories with receipts):**
- Sheet name: category name (truncated to 31 chars — Excel limit)
- Row 1: Category name (bold)
- Row 2: blank
- Row 3: Headers: Date | Store | Items | Subtotal | Tax | Total
- Rows 4+: One row per receipt, sorted by date
  - "Items" column: comma-separated list of selected line item descriptions
- Bottom row: Category Total (bold)

### 5C: CSV Generation

Alternative to Excel — single flat file:
- Headers: Date, Store, Category, Items, Subtotal, Tax, Total
- One row per receipt
- Sorted by date
- Standard CSV encoding, comma-delimited, quoted strings

### 5D: Export Destinations

**Download:** Generate the file in the browser and trigger a download using a Blob URL.

**Google Drive:** Upload the generated file to `Scatterbrain Scanner/Exports/Expenses_[Year]_[UserName].xlsx`. Reuse the Drive upload utility from Phase 3. Show a success message with "Open in Google Drive" link.

**Dropbox:** Same pattern — upload to `Scatterbrain Scanner/Exports/`. Show success with link.

**Email:** Send the file as an attachment via the send-email Netlify Function. Pre-fill recipient with user's own email. Subject: "Expense Report — [Year]". Body: "Attached is your expense summary for [Year]. Total: $[X,XXX] across [N] receipts in [Y] categories."

**Show me Phase 5 before moving to Phase 6.**

---

## PHASE 6: Dashboard + Settings + Polish

### 6A: Dashboard

Simple overview screen — accessible from a tab or header icon:

- **This month:** total spent, receipt count
- **Year to date:** total spent, receipt count
- **Spending by category:** horizontal bar chart (use Recharts — `npm install recharts`)
  - Each bar is a category, color-coded, showing total spent
  - Only show categories with receipts
- **Top category:** which category has the most spending this year
- **Recent activity:** last 5 receipts scanned as compact cards (tap to go to receipt)

All data pulled from IndexedDB — no server calls needed. Keep it to one screen, no drill-downs.

### 6B: Settings

Collapsible sections matching PaintBrain's dark theme style:

**Profile:**
- Full name, business name (optional), email, phone (optional)
- These populate export headers and email templates
- Saved to IndexedDB users store

**Categories:**
- From Phase 2 — list, add, hide, delete custom
- Color swatches next to each

**Cloud Storage:**
- From Phase 3 — Google Drive and Dropbox connect/disconnect
- Primary storage selector if both connected

**Export Defaults:**
- Default format: Excel or CSV
- Default destination: Download, Google Drive, Dropbox, Email

**About:**
- "Scatterbrain Scanner v1.0"
- "From the makers of PaintBrain" with link to paintbrainapp.com
- Support email

### 6C: PostHog Analytics Events

Make sure these events are being captured throughout the app:
- `receipt_scanned` — properties: category, item_count, total_amount
- `receipt_shared` — properties: method (email or native), recipient_count
- `category_changed` — when user overrides AI suggestion. Properties: suggested, chosen
- `export_generated` — properties: year, format, destination, receipt_count, total_amount
- `account_created`
- `app_opened`
- `drive_connected` / `dropbox_connected`

Enable session replay in PostHog configuration for admin review.

### 6D: Polish

- Loading states on every async operation (scanning, uploading, exporting)
- Error messages that are human-readable, not technical
- Smooth transitions between screens
- Receipt photo viewer — tap the thumbnail to see full-size image
- Pull-to-refresh on the receipt library
- Empty states with helpful messages and scan button on every empty screen
- Confirm before delete on every destructive action

**Show me Phase 6 before moving to Phase 7.**

---

## PHASE 7: Landing Page (LAST)

### 7A: Landing Page

Route: `/` for unauthenticated users (same pattern as PaintBrain — authenticated users go to receipt library, unauthenticated go to landing page).

**Content top to bottom:**
- PaintBrain brain logo + "Scatterbrain Scanner"
- Tagline: "Stop sorting receipts. Start scanning them."
- Subtitle: "Snap a receipt. Pick your items. Tax time done."
- Phone mockup showing the app (screenshot of receipt library with a few color-coded receipts)
- Three feature cards:
  - "Scan & categorize in seconds" — camera icon
  - "Split personal and business items" — checkbox icon
  - "Export a tax-ready spreadsheet" — spreadsheet icon
- "Sign Up Free" button
- "Already have an account? Sign In" link
- Footer: "From the makers of PaintBrain" with link

### 7B: PWA Install Instructions

After sign-up, show the same device-specific install screen pattern we designed for PaintBrain:
- Detect iPhone vs Android
- Show step-by-step with icons for adding to home screen
- "I'll do this later" skip option
- Only shows once (flag in IndexedDB)

### 7C: Pricing Section (ON LANDING PAGE — placeholder for now)

Don't build the payment system — just show the tiers as informational:

- **Free:** "Scan and categorize receipts. Stored on your device."
- **Cloud — $2/month:** "Auto-sync to Google Drive or Dropbox. Never lose a receipt."
- **Pro — Coming Soon:** "Full database backup, multi-device sync, priority support."

No payment buttons, no Stripe, no subscription logic. Just the information so visitors know what's coming. We'll build payments later.

**Show me Phase 7 when complete.**

---

## Design Rules (Apply to ALL Phases)

- **Mobile-first.** This app is used at store counters and on job sites. Every element must work on iPhone.
- **Dark theme.** Match PaintBrain's dark aesthetic — same background colors, card styles, border treatments, accent colors.
- **Fast.** Compress images before AI. Show loading states. Scanning should feel instant.
- **Simple.** This is a receipt scanner, not QuickBooks. One screen for scanning, one for browsing, one for exporting. Resist complexity.
- **Touch-friendly.** Big tap targets. Comfortable spacing. Paint-covered fingers.
- **Offline-capable.** Everything except AI parsing and cloud uploads works without internet. Receipts save to IndexedDB. Cloud uploads queue and retry.
- **No PaintBrain data crossover.** Completely separate app. Own IndexedDB stores, own cloud folders, own PostHog project, own OAuth apps. Shared: visual design language and brain logo only.
- **Battery friendly.** No background polling or constant syncing. Upload queue retries on app open and every 5 minutes while open, not continuously.

---

## Build Order Summary

| Phase | What | Depends On |
|-------|------|------------|
| 1 | Scaffold + Auth + Receipt Scanner + Library (basic) | Nothing — start here |
| 2 | Categories + Library upgrade + Batch select | Phase 1 |
| 3 | Google Drive + Dropbox integration | Phase 1 (Phase 2 nice to have) |
| 4 | Share receipts (email + native share) | Phase 1 |
| 5 | Year-end Excel/CSV export | Phase 2 (needs categories) |
| 6 | Dashboard + Settings + Analytics + Polish | Phases 1-5 |
| 7 | Landing page + PWA install + Pricing display | Phase 6 |

**Show me each phase when complete before starting the next.**

**Start with Phase 1. Read PaintBrain's receipt scanning code first, then scaffold the project and extract.**
