import jwt from 'jsonwebtoken';
import db, { jwtSecret } from '../db.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.clearCookie('token');
    res.status(401).json({ error: 'Invalid session' });
  }
}

// Requires requireAuth first. The admin is the first account (migration v1).
export function requireAdmin(req, res, next) {
  const u = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user?.id);
  if (u?.is_admin !== 1) return res.status(403).json({ error: 'Admin only' });
  next();
}
