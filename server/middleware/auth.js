import jwt from 'jsonwebtoken';
import { jwtSecret } from '../db.js';

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
