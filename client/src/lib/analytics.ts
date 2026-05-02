import posthog from 'posthog-js';

// Vite injects import.meta.env — these are undefined until VITE_* vars are set
declare global {
  interface ImportMeta { env: Record<string, string | undefined> }
}

const KEY  = (import.meta as ImportMeta).env.VITE_POSTHOG_KEY;
const HOST = (import.meta as ImportMeta).env.VITE_POSTHOG_HOST;

export function initAnalytics() {
  if (!KEY) return;
  posthog.init(KEY, {
    api_host: HOST ?? 'https://app.posthog.com',
    capture_pageview: true,
  });
}

export function identifyUser(id: number, email: string) {
  if (!KEY) return;
  posthog.identify(String(id), { email });
}

export function resetUser() {
  if (!KEY) return;
  posthog.reset();
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!KEY) return;
  posthog.capture(event, props);
}
