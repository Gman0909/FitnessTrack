import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import db, { jwtSecret } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-up attempts, please try again later' },
});

const DEFAULT_EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'];

// Sign-up is always open on a fresh install (no accounts yet) so the first
// person can create the admin account. After that it is closed unless the
// admin opens it (config.registration_open = '1', toggled in Setup).
export function registrationOpen() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) return true;
  return db.prepare("SELECT value FROM config WHERE key = 'registration_open'").get()?.value === '1';
}

function cookieOpts(req) {
  return { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 7 * 24 * 60 * 60 * 1000 };
}

function setToken(res, req, userId) {
  const token = jwt.sign({ id: userId }, jwtSecret, { expiresIn: '7d' });
  res.cookie('token', token, cookieOpts(req));
}

const USER_COLS = 'id, username, name, glyph, is_admin';

function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, glyph: u.glyph, is_admin: u.is_admin === 1 };
}

// Returns current user from cookie, or null
router.get('/me', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.json(null);
  try {
    const { id } = jwt.verify(token, jwtSecret);
    const user = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id);
    res.json(user ? publicUser(user) : null);
  } catch {
    res.clearCookie('token');
    res.json(null);
  }
});

router.get('/registration', (_req, res) => {
  res.json({ open: registrationOpen() });
});

router.post('/register', registerLimiter, async (req, res) => {
  if (!registrationOpen())
    return res.status(403).json({ error: 'Sign-up is closed. Ask the admin to open it.' });
  const { username, name, glyph, password } = req.body;
  if (typeof username !== 'string' || typeof name !== 'string' || typeof password !== 'string'
      || !username.trim() || !name.trim() || !password)
    return res.status(400).json({ error: 'username, name and password are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username.trim().toLowerCase()))
    return res.status(409).json({ error: 'Username already taken' });

  const hash = await bcrypt.hash(password, 12);
  const userId = db.transaction(() => {
    const isFirst = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
    const { lastInsertRowid: id } = db.prepare(
      'INSERT INTO users (username, name, glyph, password_hash, is_admin) VALUES (?, ?, ?, ?, ?)'
    ).run(username.trim().toLowerCase(), name.trim(), glyph || '🏋️', hash, isFirst ? 1 : 0);
    const insEq = db.prepare('INSERT OR IGNORE INTO user_equipment (user_id, equipment) VALUES (?, ?)');
    for (const eq of DEFAULT_EQUIPMENT) insEq.run(id, eq);
    return id;
  })();

  // Claim any pre-existing unclaimed plans and sessions (migration path)
  db.prepare('UPDATE workout_plans SET user_id = ? WHERE user_id IS NULL').run(userId);
  db.prepare('UPDATE sessions SET user_id = ? WHERE user_id IS NULL').run(userId);

  setToken(res, req, userId);
  const user = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(userId);
  res.status(201).json(publicUser(user));
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || typeof password !== 'string')
    return res.status(400).json({ error: 'username and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
  setToken(res, req, user.id);
  res.json(publicUser(user));
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', cookieOpts(req));
  res.json({ ok: true });
});

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { name, glyph, current_password, new_password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    const updates = {};
    if (name?.trim())  updates.name  = name.trim();
    if (glyph)         updates.glyph = glyph;

    if (new_password) {
      if (!current_password)
        return res.status(400).json({ error: 'Current password required' });
      const ok = await bcrypt.compare(current_password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Incorrect current password' });
      if (new_password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      updates.password_hash = await bcrypt.hash(new_password, 12);
    }

    if (Object.keys(updates).length === 0) return res.json(publicUser(user));
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`).run(...Object.values(updates), req.user.id);
    res.json(publicUser(db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(req.user.id)));
  } catch (err) {
    console.error('PATCH /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
