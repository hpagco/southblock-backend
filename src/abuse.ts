import type { Env } from './types';
import { HttpError } from './http';

const MAX_POSTS_PER_HOUR = 5;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** We never store raw IPs, only a salted hash used to rate-limit. */
export async function visitorHash(req: Request, env: Env): Promise<string> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
  return sha256Hex(`${env.IP_SALT ?? 'dev-salt'}|${ip}`);
}

export async function enforceRateLimit(env: Env, ipHash: string): Promise<void> {
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM submission_log WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')")
    .bind(ipHash)
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= MAX_POSTS_PER_HOUR) throw new HttpError(429, 'Too many submissions. Please try again later.');
}

/** Constant-time string compare (via digests) for the admin token. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
