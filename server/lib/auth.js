const crypto = require('crypto');

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

// ─── AUTH_SECRET is required, full stop ──────────────────────────────────────
// There used to be a hardcoded fallback ('dispatch-development-secret') used
// whenever this env var was unset. That meant any deployment that forgot to
// set AUTH_SECRET was silently signing tokens with a secret sitting in plain
// text in this file — anyone who read the source could forge a valid token
// for any user ID. Failing fast at startup is much safer than failing silently
// in production. Generate a real one with: openssl rand -hex 32
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  throw new Error(
    'AUTH_SECRET environment variable is not set. Refusing to start — see .env.example. ' +
    'Generate one with: openssl rand -hex 32'
  );
}

// ─── Login attempt lockout ───────────────────────────────────────────────────
// In-memory only (no Redis in this stack) — resets on server restart, which is
// an acceptable tradeoff for a small single-office deployment. Keyed by
// lowercased email rather than IP, since IP-based limiting would lock out an
// entire shared office network from one person's typos.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

// email -> { count, firstFailureAt, lockedUntil }
const loginAttempts = new Map();

function normalizeEmailKey(email) {
  return String(email || '').trim().toLowerCase();
}

// Returns { locked: boolean, remainingMs: number } — call before verifying
// credentials so a locked-out account never even reaches the password check.
function checkLoginLockout(email) {
  const key = normalizeEmailKey(email);
  const entry = loginAttempts.get(key);
  if (!entry || !entry.lockedUntil) return { locked: false, remainingMs: 0 };

  const remainingMs = entry.lockedUntil - Date.now();
  if (remainingMs <= 0) {
    loginAttempts.delete(key);
    return { locked: false, remainingMs: 0 };
  }
  return { locked: true, remainingMs };
}

// Call on every failed login (bad email or bad password — don't distinguish,
// so the lockout can't be used to enumerate which emails exist). Locks the
// account for LOCKOUT_MS once MAX_FAILED_ATTEMPTS is reached.
function recordFailedLogin(email) {
  const key = normalizeEmailKey(email);
  const entry = loginAttempts.get(key) || { count: 0, firstFailureAt: Date.now(), lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  loginAttempts.set(key, entry);
}

// Call on every successful login — clears any accumulated failures.
function clearLoginAttempts(email) {
  loginAttempts.delete(normalizeEmailKey(email));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expected] = String(storedHash).split(':');
  if (!salt || !expected) return false;

  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

// Generates a random, single-use temp password for admin-created accounts.
// base64url alphabet (A-Z a-z 0-9 - _) so it's easy to write on paper and
// type back in, while still being unguessable. 12 chars ≈ 71 bits of entropy.
function generateTempPassword(length = 12) {
  return crypto.randomBytes(length)
    .toString('base64url')
    .replace(/[-_]/g, (c) => (c === '-' ? '2' : '9')) // avoid ambiguous punctuation on paper
    .slice(0, length);
}

function createToken(user) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;

  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: !!user.mustChangePassword,
  };
}

module.exports = {
  createToken,
  generateTempPassword,
  hashPassword,
  publicUser,
  verifyPassword,
  verifyToken,
  checkLoginLockout,
  recordFailedLogin,
  clearLoginAttempts,
};