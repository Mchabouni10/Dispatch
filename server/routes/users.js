const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const requirePermission = require('../middleware/requirePermission');
const { isRoleAbove, getAssignableRoles, ROLE_HIERARCHY } = require('../lib/permissions');
const { generateTempPassword, hashPassword, publicUser } = require('../lib/auth');

// Get all users
router.get('/', requirePermission('users', 'view'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(users.map((user) => ({ ...publicUser(user), createdAt: user.createdAt })));
  } catch (err) {
    next(err);
  }
});

// Create a user (admin-created account flow — this replaces open self-signup).
// Generates a random temp password, returned ONCE in the response body so the
// admin can hand it to the new person; it is never stored in plaintext or
// retrievable again. The account is locked to just the password-change route
// (via requireAuth's mustChangePassword check) until they log in and set
// their own password.
router.post('/', requirePermission('users', 'full'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const { role } = req.body;

    if (name.length < 2) return res.status(400).json({ message: 'Enter a name' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
    if (!ROLE_HIERARCHY.includes(role)) return res.status(400).json({ message: 'Invalid role' });

    const assignableRoles = getAssignableRoles(req.user.role);
    if (!assignableRoles.includes(role)) {
      return res.status(403).json({ message: 'You cannot create a user with this role' });
    }

    const tempPassword = generateTempPassword();

    const user = await prisma.user.create({
      data: {
        name,
        email,
        role,
        passwordHash: hashPassword(tempPassword),
        mustChangePassword: true,
        createdBy: req.user.email,
      },
    });

    // tempPassword only ever appears in this one response — write it down now.
    res.status(201).json({ user: publicUser(user), tempPassword });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'An account with that email already exists' });
    next(err);
  }
});

// Change user role
router.put('/:id/role', requirePermission('users', 'full'), async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const { role } = req.body;
    
    if (!ROLE_HIERARCHY.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const assignableRoles = getAssignableRoles(req.user.role);
    if (!assignableRoles.includes(role)) {
      return res.status(403).json({ message: 'You cannot assign this role' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    // A user cannot change a role that is higher than their own (e.g., DIRECTOR cannot demote SUPER_ADMIN)
    if (req.user.role !== 'SUPER_ADMIN' && !isRoleAbove(req.user.role, targetUser.role)) {
        return res.status(403).json({ message: 'You cannot modify a user with this role' });
    }

    // A user cannot change their own role
    if (targetUserId === req.user.id) {
      return res.status(400).json({ message: 'You cannot modify your own role' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { role }
    });

    res.json(publicUser(updatedUser));
  } catch (err) {
    next(err);
  }
});

// Delete user
router.delete('/:id', requirePermission('users', 'full'), async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    if (targetUserId === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    if (req.user.role !== 'SUPER_ADMIN' && !isRoleAbove(req.user.role, targetUser.role)) {
      return res.status(403).json({ message: 'You cannot delete a user with this role' });
    }

    await prisma.user.delete({ where: { id: targetUserId } });
    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
