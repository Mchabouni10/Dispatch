const prisma = require('../lib/prisma');
const { publicUser, verifyToken } = require('../lib/auth');

module.exports = async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const tokenData = verifyToken(token);

  if (!tokenData) return res.status(401).json({ message: 'Please sign in to continue' });

  try {
    const user = await prisma.user.findUnique({ where: { id: tokenData.sub } });
    if (!user) return res.status(401).json({ message: 'Your session is no longer valid' });

    // Admin-created accounts start with mustChangePassword: true. Every route
    // this middleware guards is off-limits until the person sets their own
    // password. /auth/me and /auth/password don't go through requireAuth at
    // all (they verify the token inline), so those stay reachable — that's
    // intentional, it's how the client fetches the profile and completes the
    // password change.
    if (user.mustChangePassword) {
      return res.status(403).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must set a new password before continuing.',
      });
    }

    req.user = publicUser(user);
    next();
  } catch (error) {
    next(error);
  }
};