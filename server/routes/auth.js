const express = require('express');
const prisma = require('../lib/prisma');
const { createToken, hashPassword, publicUser, verifyPassword, verifyToken } = require('../lib/auth');

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

router.post('/register', async (req, res, next) => {
  const input = credentials(req.body);
  const error = validate(input);
  if (error) return res.status(400).json({ message: error });

  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash: hashPassword(input.password) },
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

  try {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      return res.status(401).json({ message: 'Email or password is incorrect' });
    }
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

module.exports = router;