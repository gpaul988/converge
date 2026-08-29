import jwt from 'jsonwebtoken';

const SECRET = process.env.ADMIN_JWT_SECRET || '';
export const ACCESS_TTL = 15 * 60; // seconds
export const REFRESH_TTL = 7 * 24 * 60 * 60; // seconds

export function signTokens(payload = {}) {
  if (!SECRET) throw new Error('ADMIN_JWT_SECRET not configured');
  const access = jwt.sign(payload, SECRET, { expiresIn: ACCESS_TTL });
  const refresh = jwt.sign(payload, SECRET, { expiresIn: REFRESH_TTL });
  return { access, refresh };
}

export function verifyToken(token) {
  if (!SECRET) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

export function getTokenFromReq(req) {
  // Authorization header
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  // cookie
  const cookie = req.headers.cookie || '';
  const match = cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('access_token='));
  if (match) return match.split('=')[1];
  return null;
}

export function clearAuthCookies(res) {
  const opts = ['Path=/','HttpOnly','SameSite=Lax','Max-Age=0'];
  if (process.env.NODE_ENV === 'production') opts.push('Secure');
  res.setHeader('Set-Cookie', [`access_token=; ${opts.join('; ')}`, `refresh_token=; ${opts.join('; ')}`]);
}

export function makeAuthCookies(access, refresh) {
  const secure = process.env.NODE_ENV === 'production';
  const accessCookie = `access_token=${access}; HttpOnly; Path=/; Max-Age=${ACCESS_TTL}; SameSite=Lax${secure?'; Secure':''}`;
  const refreshCookie = `refresh_token=${refresh}; HttpOnly; Path=/; Max-Age=${REFRESH_TTL}; SameSite=Lax${secure?'; Secure':''}`;
  return { accessCookie, refreshCookie };
}
