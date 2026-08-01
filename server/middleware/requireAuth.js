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
    req.user = publicUser(user);
    next();
  } catch (error) {
    next(error);
  }
};