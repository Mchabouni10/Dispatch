const express = require('express');
const prisma = require('../lib/prisma');
const {
  createToken,
  hashPassword,
  publicUser,
  verifyPassword,
  verifyToken,
  checkLoginLockout,
  recordFailedLogin,
  clearLoginAttempts,
} = require('../lib/auth');

const router = express.Router();

function credentials(body) {
  return {
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    password: String(body.password || ''),
  };
}

function validate({ name, email, password }, includeName = true) {
  if (includeName && name.length < 2) return 'Enter your name';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Enter a valid email address';
  if (password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

// Public: lets the client know whether this is a brand-new install (no users
// yet, so the sign-up form should show) or an established one (sign-up is
// closed, accounts come from an admin). No auth required — that's the point,
// AuthView needs this before anyone is logged in.
router.get('/bootstrap-status', async (req, res, next) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ needsSetup: userCount === 0 });
  } catch (err) {
    next(err);
  }
});

// Self-service registration only works for the very first account (the
// bootstrap SUPER_ADMIN). After that, accounts are created by an admin from
// Users → Create User, which issues a temp password instead. This is the
// fix for open signup handing out live DISPATCHER access to anyone who
// finds the URL.
router.post('/register', async (req, res, next) => {
  const input = credentials(req.body);
  const error = validate(input);
  if (error) return res.status(400).json({ message: error });

  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(403).json({
        message: 'Self-service sign-up is disabled. Ask an administrator to create your account.',
      });
    }

    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash: hashPassword(input.password), role: 'SUPER_ADMIN' },
    });
    res.status(201).json({ token: createToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'An account with that email already exists' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  const input = credentials(req.body);
  const error = validate(input, false);
  if (error) return res.status(400).json({ message: error });

  // Checked before touching the DB — a locked-out account should never even
  // reach the password check while it's locked.
  const lockout = checkLoginLockout(input.email);
  if (lockout.locked) {
    const minutesLeft = Math.ceil(lockout.remainingMs / 60000);
    return res.status(429).json({
      message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
    });
  }

  try {
    let user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      // Same failure path for "no such user" and "wrong password" — recording
      // and messaging identically so the lockout can't be used to enumerate
      // which emails have accounts.
      recordFailedLogin(input.email);
      return res.status(401).json({ message: 'Email or password is incorrect' });
    }

    clearLoginAttempts(input.email);

    if (user.role !== 'SUPER_ADMIN') {
      const [userCount, superAdminCount] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: 'SUPER_ADMIN' } }),
      ]);
      if (userCount === 1 && superAdminCount === 0) {
        user = await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN' } });
      }
    }
    // Login itself is never blocked by mustChangePassword — the client reads
    // that flag off the returned user and routes to the forced password
    // screen. Everything else the token can reach IS blocked (see requireAuth).
    res.json({ token: createToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  const tokenData = verifyToken(req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!tokenData) return res.status(401).json({ message: 'Please sign in to continue' });

  try {
    const user = await prisma.user.findUnique({ where: { id: tokenData.sub } });
    if (!user) return res.status(401).json({ message: 'Your session is no longer valid' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// Sets a new password and clears mustChangePassword. Deliberately verifies
// the OLD password (the temp one from the paper) rather than trusting the
// token alone — proves the caller actually has the credential that was
// handed to them, not just a still-valid session.
router.patch('/password', async (req, res, next) => {
  const tokenData = verifyToken(req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!tokenData) return res.status(401).json({ message: 'Please sign in to continue' });

  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ message: 'New password must be different from the temporary one' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: tokenData.sub } });
    if (!user) return res.status(401).json({ message: 'Your session is no longer valid' });

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword), mustChangePassword: false },
    });

    res.json({ user: publicUser(updated) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

