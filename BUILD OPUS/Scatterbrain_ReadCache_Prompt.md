# Scatterbrain Scanner — Read Cache Layer

## Overview

Add an IndexedDB read cache to Scatterbrain Scanner so the app feels instant even when the Render free tier server is in a cold start (30-60 seconds to wake up). Users open the app and see their receipts immediately from cache. The server wakes up in the background. By the time they want to scan a new receipt, the server is ready.

Read the existing API call patterns and data flow before making changes.

**The rule: writes still go to the server. Only reads get cached.**

---

## How It Works

### The User Experience

**Without cache (current):**
1. User opens app
2. App calls Render server
3. Server is asleep on free tier
4. User stares at loading spinner for 30-60 seconds
5. Server wakes up, returns data
6. Receipts appear

**With cache:**
1. User opens app
2. Cached receipts appear instantly from IndexedDB (under 5ms)
3. In the background, app pings the server
4. Server wakes up during 30-60 seconds while user is already browsing
5. When server responds, any new data silently updates on screen
6. User never noticed the cold start

---

## Implementation

### Step 1: Create the Cache Utility

Create `client/src/utils/cache.ts`:

```typescript
const DB_NAME = 'scatterbrain-cache';
const DB_VERSION = 1;
const STORE_NAME = 'api-cache';

interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
  userEmail: string;
}
```

Methods needed:

**`setCache(key, data, userEmail)`** — Save an API response to IndexedDB. Key is the endpoint URL (e.g., "/api/receipts"). Data is the JSON response. Scoped to the user's email so different users on the same device don't see each other's data.

**`getCache(key, userEmail)`** — Retrieve cached data. Returns null if no cache exists or if the cache is older than 7 days (max age).

**`clearUserCache(userEmail)`** — Delete all cache entries for a specific user. Called on logout.

**`clearAllCache()`** — Nuclear option. Delete everything.

**`cleanExpiredCache()`** — Delete any entries older than 7 days. Run this on app startup.

### Step 2: Create a Cached Fetch Wrapper

Create `client/src/utils/cachedFetch.ts`:

```typescript
import { getCache, setCache } from './cache';

export async function cachedFetch(
  url: string, 
  userEmail: string,
  options?: RequestInit
): Promise<{ data: any; fromCache: boolean }> {
  
  // 1. Try to get cached data
  const cached = await getCache(url, userEmail);
  
  if (cached) {
    // 2. Return cached data immediately
    // 3. Fetch fresh data in background (fire and forget)
    fetchAndUpdateCache(url, userEmail, options);
    return { data: cached, fromCache: true };
  }
  
  // 4. No cache — fetch from server (this is where cold start hurts)
  const freshData = await fetchFromServer(url, options);
  await setCache(url, freshData, userEmail);
  return { data: freshData, fromCache: false };
}

async function fetchAndUpdateCache(
  url: string, 
  userEmail: string, 
  options?: RequestInit
) {
  try {
    const freshData = await fetchFromServer(url, options);
    await setCache(url, freshData, userEmail);
    // Dispatch a custom event so components can re-render with fresh data
    window.dispatchEvent(new CustomEvent('cache-updated', { 
      detail: { key: url } 
    }));
  } catch (error) {
    // Server still waking up or offline — cached data stays, no error shown
    console.log('Background refresh failed, using cache:', url);
  }
}

async function fetchFromServer(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
```

The key pattern: return cached data immediately, refresh in the background, emit an event when fresh data arrives so components update silently.

### Step 3: Apply to Every GET Endpoint

Scatterbrain Scanner has a simple set of read endpoints. Cache ALL of them:

| Endpoint | What it returns | Cache priority |
|----------|----------------|----------------|
| `GET /api/receipts` | All receipts for the user | HIGH — this is the main screen |
| `GET /api/receipts/:id` | Single receipt detail | MEDIUM |
| `GET /api/categories` | User's categories | HIGH — needed for filtering |
| `GET /api/settings` | User preferences | HIGH — needed on startup |
| `GET /api/export/preview` | Export preview data | LOW — only used occasionally |

For each component that fetches data, replace the direct fetch with `cachedFetch`:

**Before:**
```typescript
useEffect(() => {
  fetch('/api/receipts', { headers: { Authorization: `Bearer ${token}` } })
    .then(res => res.json())
    .then(data => setReceipts(data));
}, []);
```

**After:**
```typescript
useEffect(() => {
  const loadReceipts = async () => {
    const { data, fromCache } = await cachedFetch(
      '/api/receipts', 
      user.email,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setReceipts(data);
  };
  loadReceipts();

  // Listen for background refresh
  const handleUpdate = (e: CustomEvent) => {
    if (e.detail.key === '/api/receipts') {
      loadReceipts();
    }
  };
  window.addEventListener('cache-updated', handleUpdate);
  return () => window.removeEventListener('cache-updated', handleUpdate);
}, []);
```

### Step 4: Pre-Warm the Server

Add a silent server ping on app startup that runs independently of any data fetching:

```typescript
// In App.tsx or main.tsx, on app mount:
useEffect(() => {
  // Wake up the server immediately, even before the user does anything
  fetch('/api/health').catch(() => {});
}, []);
```

This starts the cold start countdown the moment the app opens. By the time the user taps "Scan Receipt" (which needs the server for the OpenAI call), the server is likely already warm.

### Step 5: Cache Invalidation

When data changes (write operations), invalidate the relevant cache:

**After scanning a receipt:**
```typescript
// Receipt saved to server successfully
await setCache('/api/receipts', null, userEmail); // Clear receipts cache
// Next read will fetch fresh from server
```

**After editing a receipt:**
```typescript
await setCache('/api/receipts', null, userEmail);
await setCache(`/api/receipts/${id}`, null, userEmail);
```

**After changing categories or settings:**
```typescript
await setCache('/api/categories', null, userEmail);
await setCache('/api/settings', null, userEmail);
```

The simplest approach: after any successful write operation, clear the cache for that endpoint. The next read fetches fresh data and re-caches it.

### Step 6: Clear Cache on Logout

In the logout function:

```typescript
const logout = () => {
  clearUserCache(user.email);
  // ... existing logout logic
};
```

Prevents cross-account data bleed — same pattern as PaintBrain.

### Step 7: Loading States

When the app has cached data, no loading spinner is needed. When there's no cache (first ever use, or cache was cleared), show the existing loading state.

Add a visual indicator that data is refreshing in the background — a very subtle progress bar at the top of the screen or a small spinning icon in the header. Not blocking, not intrusive. Just a hint that says "checking for updates..." that disappears when the background refresh completes.

If the background refresh brings new data that differs from the cache, update the UI smoothly — no page flash, no jarring re-render. React's state update handles this naturally.

### Step 8: Offline Resilience

When the app is offline or the server is unreachable:

- Cached data displays normally — the user can browse all their receipts, view details, filter by category
- The background refresh fails silently — no error toast, no red banner
- If the user tries to scan a receipt (which needs the server for OpenAI), show a friendly message: "No connection — try again when you're back online"
- If the user tries to send/share a receipt (which needs the server for Resend), same friendly message
- Everything else works from cache

---

## What NOT to Cache

- **Receipt images** — too large for IndexedDB. Keep loading from server/R2 on demand.
- **Auth tokens** — security risk. Keep in localStorage as currently implemented.
- **POST/PUT/DELETE responses** — these are write confirmations, not data to cache.
- **The OpenAI parsing response** — this is a one-time AI call, not a data read.

---

## What NOT to Change

- Do NOT change how receipts are saved to the server
- Do NOT change how the OpenAI scanning works
- Do NOT change how email sharing works
- Do NOT change the auth flow
- Do NOT change the export generation
- Do NOT make the app dependent on the cache — if IndexedDB is empty, everything works as before (just slower on cold starts)

---

## Testing Scenarios

1. **Cold start simulation:** Stop the Render server. Open the app. Cached receipts should appear. Server wakes up in background. After 30-60 seconds, verify background refresh completes silently.

2. **First ever use:** Clear all browser data. Open app. No cache exists. App shows loading state, waits for server, works normally. After first load, cache is populated.

3. **Offline mode:** Turn off wifi. Open app. Cached data appears. Navigate between views. Everything works except scanning and sharing (which need the server).

4. **Data freshness:** Scan a receipt. Close app. Reopen. New receipt should appear (either from cache invalidation after the scan, or from the background refresh).

5. **Account switching:** Log out, log in as different user. No cached data from previous user should appear.

6. **Cache expiry:** Manually set a cache entry's timestamp to 8 days ago. Open app. That endpoint should fetch fresh from server instead of using expired cache.

---

## Estimated Effort

| Step | Effort |
|------|--------|
| Cache utility (cache.ts) | 1 hour |
| Cached fetch wrapper | 1 hour |
| Apply to all GET endpoints | 2-3 hours |
| Server pre-warm ping | 10 minutes |
| Cache invalidation after writes | 1 hour |
| Logout cache clearing | 10 minutes |
| Loading state adjustments | 30 minutes |
| Offline resilience | 30 minutes |
| Testing | 1-2 hours |
| **Total** | **~1 day** |

---

## The Payoff

After this is implemented, Scatterbrain Scanner on Render's free tier ($0/month) feels faster than most apps on paid hosting. Cold starts become invisible. Starlink drops become non-events. The app works offline for browsing. And you've proven the pattern for later applying to PaintBrain.

**One day of work. Zero monthly cost increase. Dramatically better user experience.**
