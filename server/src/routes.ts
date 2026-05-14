import { Router, Request, Response } from 'express';
import multer from 'multer';
import { extractReceiptLineItems } from './visionHandler.js';
import { sendReceiptEmail } from './email.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function parseClientOrigin(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function renderAuthCallbackPage(provider: string, clientOrigin: string, payload: Record<string, any>) {
  const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Scatterbrain Cloud Auth</title>
  <style>body{background:#000;color:#fff;font-family:system-ui, sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;}</style>
</head>
<body>
  <div style="max-width:520px;text-align:center;">
    <h1 style="margin-bottom:0.5rem;">${provider} connected</h1>
    <p style="opacity:.75;margin-bottom:1.2rem;">You may now close this window and return to Scatterbrain.</p>
    <script>
      const payload = ${safePayload};
      const targetOrigin = ${JSON.stringify(clientOrigin || '*')};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'scatterbrain_cloud_auth', provider: ${JSON.stringify(provider)}, payload }, targetOrigin);
        window.close();
      } else {
        document.body.insertAdjacentHTML('beforeend', '<p style="opacity:.75;">Return to Scatterbrain to complete the connection.</p>');
      }
    </script>
  </div>
</body>
</html>`;
}

// ── OCR (Vision API proxy) ────────────────────────────────────────────────────

router.post('/ocr/receipt', upload.single('receipt'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  try {
    const result = await extractReceiptLineItems(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err) {
    console.error('OCR error:', err);
    res.status(500).json({ error: 'OCR failed' });
  }
});

// ── Email share ───────────────────────────────────────────────────────────────

router.post('/share/email', async (req: Request, res: Response) => {
  const { to, storeName, date, total, category, lineItemsHtml, imageUrl } = req.body;
  if (!to || !storeName) { res.status(400).json({ error: 'Missing required fields' }); return; }
  try {
    await sendReceiptEmail({
      to,
      replyTo: process.env.REPLY_TO_EMAIL || 'noreply@scatterbrainscanner.com',
      storeName,
      date,
      total: parseFloat(total) || 0,
      category,
      lineItemsHtml: lineItemsHtml || '',
      imageUrl: imageUrl || null,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Email share failed:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    openai: !!process.env.OPENAI_API_KEY,
  });
});

// ── Cloud OAuth ──────────────────────────────────────────────────────────────────

router.get('/auth/google/init', (req: Request, res: Response) => {
  const clientOrigin = parseClientOrigin(req.query.clientOrigin?.toString());
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId || !redirectUri) {
    res.status(500).send('Google OAuth is not configured.');
    return;
  }

  const state = encodeURIComponent(clientOrigin || '');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/drive.file');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  res.redirect(url.toString());
});

router.get('/auth/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code?.toString();
  const state = parseClientOrigin(req.query.state?.toString());
  const clientOrigin = state || '*';

  if (!code) {
    res.status(400).send('Missing authorization code.');
    return;
  }

  const tokenUri = 'https://oauth2.googleapis.com/token';
  try {
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await response.json() as any;
    if (!response.ok) {
      console.error('Google token exchange failed:', tokenData);
      res.status(500).send('Google token exchange failed.');
      return;
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    const userInfo = await userInfoRes.json() as any;

    const payload = {
      ...tokenData,
      email: userInfo?.email ?? null,
    };

    res.send(renderAuthCallbackPage('google-drive', clientOrigin, payload));
  } catch (error) {
    console.error('Google callback error:', error);
    res.status(500).send('Google OAuth callback failed.');
  }
});

router.get('/auth/dropbox/init', (req: Request, res: Response) => {
  const clientOrigin = parseClientOrigin(req.query.clientOrigin?.toString());
  const redirectUri = process.env.DROPBOX_REDIRECT_URI;
  const clientId = process.env.DROPBOX_APP_KEY;

  if (!clientId || !redirectUri) {
    res.status(500).send('Dropbox OAuth is not configured.');
    return;
  }

  const state = encodeURIComponent(clientOrigin || '');
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('token_access_type', 'offline');
  url.searchParams.set('state', state);

  res.redirect(url.toString());
});

router.get('/auth/dropbox/callback', async (req: Request, res: Response) => {
  const code = req.query.code?.toString();
  const state = parseClientOrigin(req.query.state?.toString());
  const clientOrigin = state || '*';

  if (!code) {
    res.status(400).send('Missing authorization code.');
    return;
  }

  const tokenUri = 'https://api.dropbox.com/oauth2/token';
  try {
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.DROPBOX_APP_KEY || '',
        client_secret: process.env.DROPBOX_APP_SECRET || '',
        redirect_uri: process.env.DROPBOX_REDIRECT_URI || '',
      }),
    });

    const tokenData = await response.json() as any;
    if (!response.ok) {
      console.error('Dropbox token exchange failed:', tokenData);
      res.status(500).send('Dropbox token exchange failed.');
      return;
    }

    const accountRes = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    });
    const accountInfo = await accountRes.json() as any;

    const payload = {
      ...tokenData,
      email: accountInfo?.email ?? null,
    };

    res.send(renderAuthCallbackPage('dropbox', clientOrigin, payload));
  } catch (error) {
    console.error('Dropbox callback error:', error);
    res.status(500).send('Dropbox OAuth callback failed.');
  }
});

router.post('/auth/google/refresh', async (req: Request, res: Response) => {
  const refreshToken = req.body.refreshToken?.toString();
  if (!refreshToken) { res.status(400).json({ error: 'Missing refreshToken' }); return; }

  const tokenUri = 'https://oauth2.googleapis.com/token';
  try {
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await response.json() as any;
    if (!response.ok) {
      console.error('Google refresh failed:', tokenData);
      res.status(500).json({ error: 'Google refresh failed', details: tokenData });
      return;
    }

    res.json(tokenData);
  } catch (error) {
    console.error('Google refresh error:', error);
    res.status(500).json({ error: 'Google refresh failed.' });
  }
});

router.post('/auth/dropbox/refresh', async (req: Request, res: Response) => {
  const refreshToken = req.body.refreshToken?.toString();
  if (!refreshToken) { res.status(400).json({ error: 'Missing refreshToken' }); return; }

  const tokenUri = 'https://api.dropbox.com/oauth2/token';
  try {
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.DROPBOX_APP_KEY || '',
        client_secret: process.env.DROPBOX_APP_SECRET || '',
      }),
    });

    const tokenData = await response.json() as any;
    if (!response.ok) {
      console.error('Dropbox refresh failed:', tokenData);
      res.status(500).json({ error: 'Dropbox refresh failed', details: tokenData });
      return;
    }

    res.json(tokenData);
  } catch (error) {
    console.error('Dropbox refresh error:', error);
    res.status(500).json({ error: 'Dropbox refresh failed.' });
  }
});

export default router;
