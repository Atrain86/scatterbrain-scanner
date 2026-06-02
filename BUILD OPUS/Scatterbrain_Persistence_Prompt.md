# Scatterbrain Scanner — Data Persistence via Google Drive

## PRIORITY: BUILD THIS NOW

**The problem:** All receipt data is stored in IndexedDB on the phone. This data is lost if the user loses their phone, clears browser data, or iOS decides to evict PWA storage. I am actively losing data during testing. This needs to be solved before any other features.

**The solution:** Every receipt gets a companion JSON metadata file saved to Google Drive alongside the receipt image. If IndexedDB is ever wiped, the app can rebuild its entire database by reading these JSON files from Google Drive. Google Drive becomes the permanent backup. IndexedDB is the fast local cache.

---

## Part 1: Save Metadata to Google Drive on Every Receipt Save

Right now (or once Phase 3 Google Drive integration is built), when a receipt is saved, only the receipt image uploads to Google Drive. Change this so that TWO files are uploaded for every receipt:

**File 1 — The receipt image (already built):**
```
Scatterbrain Scanner/2025/Supplies & Materials/2025-03-15_HomeDepot_$129.82.jpg
```

**File 2 — A companion JSON metadata file (NEW):**
```
Scatterbrain Scanner/2025/Supplies & Materials/2025-03-15_HomeDepot_$129.82.json
```

The JSON file contains everything needed to fully reconstruct the receipt in IndexedDB:

```json
{
  "version": 1,
  "storeName": "Home Depot",
  "receiptDate": "2025-03-15",
  "subtotal": 22.78,
  "taxAmount": 2.98,
  "total": 25.76,
  "category": "Supplies & Materials",
  "lineItems": [
    {"description": "Wood Filler", "amount": 15.49, "selected": true},
    {"description": "DAP Caulking", "amount": 7.29, "selected": true},
    {"description": "Coffee", "amount": 1.50, "selected": false}
  ],
  "taxLines": [
    {"label": "GST", "amount": 1.46, "adjustedAmount": 1.14},
    {"label": "PST", "amount": 1.94, "adjustedAmount": 1.84}
  ],
  "notes": "",
  "imageFileName": "2025-03-15_HomeDepot_$129.82.jpg",
  "createdAt": "2025-03-15T14:30:00Z",
  "updatedAt": "2025-03-15T14:30:00Z"
}
```

**The JSON file is tiny** — maybe 1-2KB. Negligible storage cost. The `version` field allows future format changes without breaking old backups.

**Both files upload silently** in the background after the user taps Save, using the same upload queue system. If offline, both get queued. The user never sees or thinks about the JSON file — it's invisible infrastructure.

---

## Part 2: Update JSON When Receipt is Edited

If the user edits a receipt after saving (changes category, edits items, updates notes):

1. Update the receipt in IndexedDB as normal
2. If the category changed, move BOTH the image and JSON file to the new category folder in Google Drive
3. If only other fields changed (notes, items), overwrite the JSON file in place with updated data
4. Update the `updatedAt` timestamp in the JSON

Same for delete — when a receipt is deleted from IndexedDB, delete both the image and JSON from Google Drive.

---

## Part 3: Rebuild IndexedDB from Google Drive

Create a "Restore from Cloud" function that reconstructs the entire local database from Google Drive. This is the recovery mechanism.

**When it runs:**
- Manually: User taps "Restore from Cloud" button in Settings
- Automatically on first open: If IndexedDB is empty BUT Google Drive is connected, prompt the user: "Found [X] receipts in your Google Drive backup. Restore them?" with a Yes/No choice
- Automatically after sign-in on a new device: Same detection and prompt

**How it works:**

1. List all files in the `Scatterbrain Scanner/` folder recursively using Google Drive API
2. Filter to only `.json` files (ignore the images for now — we'll link to them)
3. Download each JSON file
4. Parse it and create a receipt record in IndexedDB with all the metadata
5. The `imageFileName` field in the JSON links to the companion image file in the same Drive folder — store the Drive file ID so the app can display the image later
6. Don't re-download all the images into IndexedDB blobs — that would use too much local storage. Instead, store the Drive file ID and load images on-demand from Google Drive when the user views a receipt
7. Show progress: "Restoring... 47 of 156 receipts"
8. When complete: "Restored 156 receipts from Google Drive backup"

**After restore:**
- The receipt library is fully populated with all metadata
- Receipt photos load from Google Drive on-demand (not stored locally)
- New receipts going forward save images locally AND to Drive as before
- The user is back to full functionality

---

## Part 4: Sync Status Indicator

Add a small sync indicator somewhere visible (header bar or bottom of receipt library):

**States:**
- ✓ "Synced" (green) — all receipts backed up to Google Drive, nothing pending
- ↑ "Syncing..." (yellow/amber) — uploads in progress
- ⚠ "X receipts not backed up" (orange) — items in the upload queue that haven't synced yet (offline or failed)
- ✕ "Not connected" (gray) — Google Drive not connected, data is local only

This gives the user confidence that their data is safe without them having to think about it. A painter glances at the green checkmark and knows they're good.

Tapping the indicator when it shows pending items should show a small list of what's waiting to upload, with a "Retry Now" button.

---

## Part 5: Periodic Integrity Check

Every time the app opens (not on every screen change — just on cold open):

1. Count receipts in IndexedDB
2. If Google Drive is connected, count JSON files in Drive (use a cached count, don't list all files every time — maybe refresh the count once per day)
3. If IndexedDB has fewer receipts than Drive, show a subtle notification: "Some receipts are only in your cloud backup. Tap to restore."
4. If IndexedDB has more receipts than Drive, check the upload queue — there are probably pending uploads. Trigger the queue.

This catches edge cases where IndexedDB gets partially wiped without the user noticing.

---

## Part 6: What About Dropbox?

If the user is connected to Dropbox instead of Google Drive, the same system applies:
- Same JSON metadata files saved alongside images
- Same folder structure
- Same rebuild/restore logic, just using Dropbox API instead of Drive API
- Same sync indicator

If both are connected, use whichever is set as Primary (from the Settings cloud storage section).

---

## Part 7: What About the Web Version? (LATER — don't build now)

This is documented for future reference only. Don't build this yet.

When the user opens Scatterbrain Scanner in a browser on their computer:
- Their computer's IndexedDB is separate from their phone's IndexedDB
- But both connect to the same Google Drive
- On the web version's first open (empty IndexedDB + Drive connected), offer "Restore from Cloud" just like on the phone
- The web version rebuilds its local IndexedDB from the same Google Drive JSON files
- Now both devices have the same data
- This is NOT real-time sync — it's a manual or first-open restore. Changes on one device don't instantly appear on the other. The user would need to restore again to pull changes.
- True real-time sync would require a server (Render backend) — that's the Pro tier feature.

---

## Implementation Order

1. **Part 1 first** — JSON metadata files uploading alongside images. This is the foundation. Without this, nothing else works.
2. **Part 2** — Update/move/delete JSON files when receipts are edited. Keeps the backup accurate.
3. **Part 3** — The restore function. This is the payoff — data recovery from cloud backup.
4. **Part 4** — Sync indicator. Gives the user confidence.
5. **Part 5** — Integrity check. Catches edge cases.
6. **Part 6** — Dropbox parity. Only if Dropbox is already integrated.
7. **Part 7** — Don't build. Document only.

**Show me each part before moving to the next. Start with Part 1.**

---

## Important

- Don't change the existing receipt scanning, parsing, or selection flow
- Don't change the IndexedDB schema — add fields if needed but don't restructure
- The JSON metadata files are invisible to the user — no UI needed except the sync indicator in Part 4
- All Google Drive operations happen in the background — never block the UI
- If Google Drive is not connected, everything still works normally with IndexedDB only — the backup is an enhancement, not a requirement
- Handle errors gracefully — if a JSON upload fails, queue it like image uploads. Don't lose the receipt data.
- The `version` field in the JSON schema is important — include it from day one so we can migrate the format later without breaking old backups
