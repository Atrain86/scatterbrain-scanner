# CLAUDE.md — Scatterbrain Scanner

## AT EVERY SESSION START:
1. Read this file
2. Show a STATUS TABLE: Current Phase, Progress %, Last Completed, Next Task
3. Ask if user wants to continue with the next task

## After completing any task:
- Update this file: change [ ] to [x] for completed tasks
- Update progress percentage

---

## PROJECT INFO

| Field | Value |
|-------|-------|
| Name | Scatterbrain Scanner |
| Type | Mobile-first PWA — receipt scanner for freelancers & small biz |
| Location | /Users/atrain_m5/Documents/AI_LOCAL/SCATTERBRAIN_SCANNER |
| Parent app | PaintBrain (DO NOT modify PB codebase) |
| Dev Server | localhost:5174 (client) → localhost:3002 (API) |
| Database (local) | SQLite at data/scatterbrain.db |
| Database (prod) | Render PostgreSQL |

## DEPLOYMENT (future — beta test first on localhost)

| Service | Platform | Trigger |
|---------|----------|---------|
| Frontend | Netlify | Auto-deploy on push to main |
| Backend | Render Starter | Auto-deploy on push to main |
| Database | Render PostgreSQL | Managed |
| File Storage | Cloudflare R2 | scatterbrain-receipts bucket |

## SEPARATE FROM PAINTBRAIN
- Own database, own auth, own R2 bucket, own PostHog project
- No shared state, no shared tokens, no shared DB
- Visual design language + brain logo are shared — nothing else

## COLOR SYSTEM
Defined in `client/tailwind.config.ts`. Prefix: `sb-*`
- Background: `sb-bg` (#000000)
- Card: `sb-card` (#1a1a2e), `sb-card2` (#16213e)
- Border: `sb-border` (#333333)
- Accent green: `sb-green` (#4ade80)
- Accent purple: `sb-purple` (#a855f7)
- Category colors: `cat-supplies`, `cat-gas`, `cat-vehicle`, etc.

## KEY PORTS
- Client dev: 5174
- Server dev: 3002
- (Chosen to avoid conflict with PaintBrain on 5175/3001)

---

# BUILD CHECKLIST

## PHASE 1: Scaffold + Receipt Scanner + Auth
**Status: 100% Complete**

- [x] 1.1 Project directory structure
- [x] 1.2 Root + client + server package.json
- [x] 1.3 Vite + Tailwind + TypeScript config
- [x] 1.4 .env.example
- [x] 1.5 Database schema (Drizzle + SQLite)
- [x] 1.6 Server: Express + auth routes (JWT, bcrypt)
- [x] 1.7 Server: Receipt scan route + OpenAI Vision handler (gpt-4o-mini)
- [x] 1.8 Server: Receipt CRUD routes
- [x] 1.9 Client: AuthContext + protected routes
- [x] 1.10 Client: Sign In + Sign Up pages
- [x] 1.11 Client: Landing page (unauthenticated)
- [x] 1.12 Client: Receipt Library (main screen)
- [x] 1.13 Client: ScanModal (camera/file → AI parse → line-item select → save)
- [x] 1.14 Client: LineItemSelector with proportional tax calc (extracted from PaintBrain)
- [x] 1.15 Client: imageCompression.ts utility

## PHASE 2: Categories + Receipt Library Polish
**Status: 100% Complete**

- [x] 2.1 Pre-built category system with colors (10 defaults in types.ts)
- [x] 2.2 AI auto-categorization (in gpt-4o-mini prompt in visionHandler.ts)
- [x] 2.3 Custom categories (Settings page — add/remove, color picker)
- [x] 2.4 Receipt Library filtering (category pills, date range, search bar)
- [x] 2.5 Expanded receipt view (line items, photo tap-to-fullscreen, inline category edit, delete)
- [x] 2.6 Empty state for new users + filtered empty state

## PHASE 3: Share Receipts
**Status: 100% Complete**

- [x] 3.1 Share modal (email + native Web Share API — iMessage, WhatsApp, SMS)
- [x] 3.2 Resend email integration (receipt image + line items HTML)
- [x] 3.3 Web Share API with image attachment fallback
- [x] 3.4 Share button on every ReceiptCard expanded view
- [x] 3.5 Recent recipients (last 10, quick-select chips)

## PHASE 4: Year-End Export
**Status: 100% Complete**

- [x] 4.1 Export page (year picker, download vs email destination)
- [x] 4.2 Excel export — summary sheet + per-category sheets, currency formatting
- [x] 4.3 Google Drive — stub in Settings (OAuth post-beta)
- [x] 4.4 Dropbox — stub in Settings (OAuth post-beta)
- [x] 4.5 Email export via Resend with xlsx attachment

## PHASE 5: Dashboard + Settings
**Status: 100% Complete**

- [x] 5.1 Dashboard: monthly spend, YTD, top category, recent receipts list
- [x] 5.2 Settings: Profile, Categories, Export section, Cloud stubs, About + Sign out
- [x] 5.3 Recharts bar chart — spending by category, color-coded per category

## PHASE 6: Branding + Landing Page
**Status: Partial — needs real logo assets**

- [x] 6.1 Dark theme with PaintBrain aesthetic
- [ ] 6.2 Brain logo assets (need PNG from PaintBrain)
- [x] 6.3 Landing page (tagline, features, CTA)
- [ ] 6.4 PWA icons (all sizes from brain logo)
- [ ] 6.5 Bottom nav + BottomNav component (done)

## PHASE 7: Analytics
**Status: 100% Complete**

- [x] 7.1 PostHog JS init (VITE_POSTHOG_KEY env var — NEW project required)
- [x] 7.2 Events: receipt_scanned, receipt_shared (email + native), export_generated
- [x] 7.3 Session recording wired (activates when key is set)

---

## OVERALL PROGRESS

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Scaffold + Scanner + Auth | ✅ Complete | 100% |
| Phase 2: Categories + Library | ✅ Complete | 100% |
| Phase 3: Share Receipts | ✅ Complete | 100% |
| Phase 4: Year-End Export | ✅ Complete | 100% |
| Phase 5: Dashboard + Settings | ✅ Complete | 100% |
| Phase 6: Branding | 🟡 Needs logo assets | 60% |
| Phase 7: Analytics | ✅ Complete | 100% |

**Total: 38/44 tasks complete (~86%) — needs logo assets + API keys to go live**

---

## SESSION LOG

| Date | Completed | Notes |
|------|-----------|-------|
| 2026-05-01 | Phase 1 full scaffold | Extracted receipt scanner from PaintBrain; gpt-4o-mini for OCR |
