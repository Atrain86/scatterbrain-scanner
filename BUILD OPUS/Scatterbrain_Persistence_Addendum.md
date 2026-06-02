# Scatterbrain Scanner — Persistence Addendum: Settings Backup & Manual Sync

**Add this to the persistence prompt after Part 5 (Periodic Integrity Check), before Part 6 (Dropbox).**

---

## Part 6: App Settings Backup to Google Drive

Receipt data is backed up via JSON sidecar files (Parts 1-3). But user settings, custom categories, profile info, and preferences also need to survive a device loss or browser wipe.

### 6A: The app_settings.json File

Store one file at the root of the Scatterbrain Scanner folder in Google Drive:

```
Scatterbrain Scanner/
├── app_settings.json    ← this file
├── 2025/
│   ├── Supplies & Materials/
│   │   ├── receipt.jpg
│   │   └── receipt.json
│   └── ...
```

Contents of `app_settings.json`:

```json
{
  "version": 1,
  "profile": {
    "fullName": "Alan",
    "businessName": "A-Frame Painting",
    "email": "alan@email.com",
    "phone": "250-555-1234"
  },
  "categories": [
    {"name": "Supplies & Materials", "color": "#F97316", "isDefault": true, "visible": true, "sortOrder": 1},
    {"name": "Gas & Fuel", "color": "#EF4444", "isDefault": true, "visible": true, "sortOrder": 2},
    {"name": "Boat Parts", "color": "#06B6D4", "isDefault": false, "visible": true, "sortOrder": 11}
  ],
  "exportDefaults": {
    "format": "xlsx",
    "destination": "drive"
  },
  "defaultInvoiceMessage": "Here's your invoice, thanks!",
  "defaultEstimateMessage": "Here's your estimate, let me know if you have questions!",
  "recentRecipients": [
    {"email": "whitney@email.com", "lastUsed": "2025-06-10T14:30:00Z"},
    {"email": "accountant@email.com", "lastUsed": "2025-04-15T09:00:00Z"}
  ],
  "updatedAt": "2025-06-15T14:30:00Z"
}
```

The `version` field allows future format migrations without breaking old backups.

### 6B: When to Save app_settings.json

Overwrite `app_settings.json` in Google Drive every time any of these change:

- User edits their profile (name, business name, email, phone)
- User adds, edits, hides, or deletes a custom category
- User changes export defaults
- User sends a receipt to a new email address (updates recentRecipients)
- User changes their default invoice or estimate message

This is a single file overwrite — not an append. The entire settings object gets written fresh each time. The file is 1-2KB, so the upload is instant.

Save to IndexedDB first (immediate), then overwrite the Drive file in the background (silent). Same pattern as receipt uploads — if offline, queue and retry.

### 6C: Restore Settings from Google Drive

When the "Restore from Cloud" function runs (Part 3 of the persistence prompt), it should:

1. **First:** Read `app_settings.json` from Google Drive
2. Restore the user's profile, categories, export preferences, recent recipients, and default messages to IndexedDB
3. **Then:** Read all receipt JSON files and restore receipts (as already described in Part 3)

Settings must restore BEFORE receipts because the category list needs to exist before receipts referencing those categories are imported. If a receipt references a custom category that exists in the settings file, the category gets created first, then the receipt imports cleanly.

If `app_settings.json` doesn't exist in Google Drive (first-time user, or connected Drive before any settings were saved), skip this step and use defaults.

---

## Part 7: Manual Sync Button

Users need a way to manually synchronize between devices. A "Sync Now" button that ensures this device and Google Drive are identical.

### 7A: What Sync Does

One button, two operations in sequence:

**Step 1 — Push (this device → Google Drive):**
- Upload any receipts in IndexedDB that don't have a Drive file ID (new or previously failed uploads)
- Upload any receipt JSON sidecar files that are missing from Drive
- Overwrite `app_settings.json` with this device's current settings
- Process the entire pending upload queue

**Step 2 — Pull (Google Drive → this device):**
- List all JSON receipt files in Google Drive
- Compare against IndexedDB — find any receipts that exist in Drive but not locally
- Download and import those missing receipts into IndexedDB
- Read `app_settings.json` from Drive and merge any changes:
  - New categories from another device get added
  - Profile changes from another device overwrite local (last-write-wins based on `updatedAt`)
  - Recent recipients get merged (union of both lists, deduplicated by email)

### 7B: Conflict Resolution

Simple rule: **last-write-wins** based on the `updatedAt` timestamp.

- If the same receipt was edited on both devices before syncing, the version with the newer `updatedAt` wins
- If `app_settings.json` was changed on both devices, the one with the newer `updatedAt` wins
- For receipts that exist on one device but not the other, they get added to both (no conflict)
- For receipts deleted on one device but still on the other: if the receipt exists in Drive, it gets restored on the device that deleted it. True deletion requires removing from BOTH IndexedDB and Drive (which the delete function in Part 2 of the persistence prompt already does).

This is sufficient for a single-user app used across two devices. You're not going to be racing yourself.

### 7C: Sync Button UI

Place the sync button in one of two locations (or both):

**Option A — Header bar:** Small sync icon (circular arrows) in the top right of the receipt library. Always visible, always accessible.

**Option B — Settings:** "Cloud Sync" section with the sync button and status.

**Recommended: Both.** Quick-access icon in the header for daily use, detailed sync section in Settings for troubleshooting.

**Button states:**

| State | Icon | Label | Color |
|-------|------|-------|-------|
| Synced — everything matches | ✓ checkmark | "Synced" | Green |
| Has unsynced changes | ↑ up arrow | "Sync Now" | Amber |
| Sync in progress | ↻ spinning | "Syncing..." | Amber, animated |
| Sync complete | ✓ checkmark | "All synced" (auto-reverts to "Synced" after 3 seconds) | Green |
| Sync failed | ⚠ warning | "Sync failed — tap to retry" | Red |
| Drive not connected | — dash | "Connect Drive to sync" | Gray |

**During sync, show brief progress:**
- "Pushing 3 receipts..."
- "Pulling 2 new receipts..."
- "Updating settings..."
- "All synced ✓"

Progress text appears below the button or as a small toast notification. Keep it unobtrusive.

### 7D: Auto-Sync vs Manual

For now, sync is primarily manual via the "Sync Now" button. But the app should also sync automatically in these situations:

- **On app open:** If Google Drive is connected and there are items in the upload queue, process the queue silently (push only, no pull — don't surprise the user with new data appearing)
- **After every receipt save:** Push the new receipt to Drive immediately (already built in the persistence prompt)
- **After every settings change:** Push the updated `app_settings.json` to Drive immediately

**Pull (getting data FROM Drive) is manual only** — the user taps "Sync Now" or "Restore from Cloud" to pull data. This prevents confusing situations where data appears or changes unexpectedly. The user is in control of when their device gets updated with data from another device.

---

## Part 8: Dropbox Parity

If the user is connected to Dropbox instead of Google Drive, all of the above applies identically:

- Same `app_settings.json` file at the root of the Scatterbrain Scanner folder in Dropbox
- Same JSON sidecar files alongside receipt images
- Same Sync Now button behavior — push and pull
- Same conflict resolution (last-write-wins)
- Same auto-push on save, manual pull

If both Google Drive and Dropbox are connected, use whichever is set as "Primary" in Settings. Don't sync to both simultaneously — that creates a nightmare of conflicting copies. One primary cloud storage, period.

---

## Updated Restore Flow (Complete)

When the app opens with an empty IndexedDB but Google Drive is connected:

1. Detect empty database + active Drive connection
2. Check if `Scatterbrain Scanner/` folder exists in Drive
3. If yes, prompt: "Found backup data in Google Drive. Restore? [Yes] [No]"
4. If user taps Yes:
   - Step 1: Read `app_settings.json` → restore profile, categories, preferences
   - Step 2: List all `.json` receipt files across all year/category folders
   - Step 3: Download each JSON file → create receipt record in IndexedDB
   - Step 4: Don't download receipt images — store the Drive file ID and load images on-demand
   - Step 5: Show progress: "Restoring... 47 of 156 receipts"
   - Step 6: Complete: "Restored 156 receipts and your settings from backup"
5. If user taps No: start fresh with defaults, but don't delete anything from Drive

---

## Implementation Order (Updated)

Add these to the existing persistence prompt implementation order:

| Part | What | Priority |
|------|------|----------|
| 1 | JSON metadata files alongside images | Build first |
| 2 | Update/move/delete JSON on edits | Build second |
| 3 | Restore from Cloud function | Build third |
| 4 | Sync status indicator | Build fourth |
| 5 | Periodic integrity check | Build fifth |
| **6** | **app_settings.json backup** | **Build sixth** |
| **7** | **Manual Sync Now button** | **Build seventh** |
| **8** | **Dropbox parity** | **Only if Dropbox is integrated** |

Parts 6 and 7 depend on Parts 1-3 being complete. Don't build them until the receipt backup foundation is solid.

**Show me each part before moving to the next.**

---

## Important

- The Sync Now button should feel snappy — for a single user with a few hundred receipts, the entire sync should complete in seconds
- Never block the UI during sync — everything happens in the background with progress indicators
- If sync fails partially (some receipts uploaded, some failed), don't roll back the successful ones — just report what failed and let the user retry
- The app must work perfectly fine with Google Drive disconnected — all sync features are enhancements, not requirements. A user who never connects cloud storage just uses IndexedDB locally and accepts the risk.
- Don't sync OAuth tokens between devices — each device authenticates with Google Drive independently
