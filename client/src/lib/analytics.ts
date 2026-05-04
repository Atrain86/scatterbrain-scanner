import posthog from 'posthog-js';

const KEY  = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

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
