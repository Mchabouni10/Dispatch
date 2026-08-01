const crypto = require('crypto');

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

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

function createToken(user) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  })).toString('base64url');
  const secret = process.env.AUTH_SECRET || 'dispatch-development-secret';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;

  const secret = process.env.AUTH_SECRET || 'dispatch-development-secret';
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
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
  return { id: user.id, name: user.name, email: user.email };
}

module.exports = { createToken, hashPassword, publicUser, verifyPassword, verifyToken };