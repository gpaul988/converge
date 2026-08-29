import { signTokens, makeAuthCookies, verifyToken, clearAuthCookies } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const { action } = req.body || {};

  if (action === 'login') {
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
    const { email, password } = req.body || {};
    if (!ADMIN_PASSWORD) {
      return res.status(400).json({ ok: false, error: 'ADMIN_PASSWORD not configured' });
    }
    if (ADMIN_EMAIL) {
      if (!email || !password) return res.status(401).json({ ok: false, error: 'Email and password required' });
      if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    } else {
      // fallback: only password required
      if (!password || password !== ADMIN_PASSWORD) return res.status(401).json({ ok: false, error: 'Invalid password' });
    }

    // issue tokens
    try {
      const tokens = signTokens({ role: 'admin', email: email || ADMIN_EMAIL || '' });
      const { accessCookie, refreshCookie } = makeAuthCookies(tokens.access, tokens.refresh);
      res.setHeader('Set-Cookie', [accessCookie, refreshCookie]);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false });
    }
  }

  if (action === 'refresh') {
    // read refresh_token cookie
    const cookie = req.headers.cookie || '';
    const match = cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('refresh_token='));
    const token = match ? match.split('=')[1] : null;
    if (!token) return res.status(401).json({ ok: false });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ ok: false });
    try {
      const tokens = signTokens({ role: 'admin' });
      const { accessCookie, refreshCookie } = makeAuthCookies(tokens.access, tokens.refresh);
      res.setHeader('Set-Cookie', [accessCookie, refreshCookie]);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false });
    }
  }

  if (action === 'logout') {
    clearAuthCookies(res);
    return res.status(200).json({ ok: true });
  }

  res.status(400).json({ ok: false, error: 'Invalid action' });
}
