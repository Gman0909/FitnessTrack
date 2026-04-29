import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db, { jwtSecret } from '../db.js';

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function setToken(res, userId) {
  const token = jwt.sign({ id: userId }, jwtSecret, { expiresIn: '7d' });
  res.cookie('token', token, COOKIE_OPTS);
}

function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, glyph: u.glyph };
}

// Returns current user from cookie, or null
router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.json(null);
  try {
    const { id } = jwt.verify(token, jwtSecret);
    const user = db.prepare('SELECT id, username, name, glyph FROM users WHERE id = ?').get(id);
    res.json(user ?? null);
  } catch {
    res.clearCookie('token');
    res.json(null);
  }
});

router.post('/register', async (req, res) => {
  const { username, name, glyph, password } = req.body;
  if (!username?.trim() || !name?.trim() || !password)
    return res.status(400).json({ error: 'username, name and password are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username.trim().toLowerCase()))
    return res.status(409).json({ error: 'Username already taken' });

  const hash = await bcrypt.hash(password, 12);
  const { lastInsertRowid: userId } = db.prepare(
    'INSERT INTO users (username, name, glyph, password_hash) VALUES (?, ?, ?, ?)'
  ).run(username.trim().toLowerCase(), name.trim(), glyph || '🏋️', hash);

  // Claim any pre-existing unclaimed plans and sessions (migration path)
  db.prepare('UPDATE workout_plans SET user_id = ? WHERE user_id IS NULL').run(userId);
  db.prepare('UPDATE sessions SET user_id = ? WHERE user_id IS NULL').run(userId);

  setToken(res, userId);
  const user = db.prepare('SELECT id, username, name, glyph FROM users WHERE id = ?').get(userId);
  res.status(201).json(publicUser(user));
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username?.trim()?.toLowerCase() ?? '');
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
  setToken(res, user.id);
  res.json(publicUser(user));
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token', COOKIE_OPTS);
  res.json({ ok: true });
});

export default router;
