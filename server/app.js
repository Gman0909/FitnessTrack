import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import authRouter     from './routes/auth.js';
import exercisesRouter from './routes/exercises.js';
import scheduleRouter  from './routes/schedule.js';
import sessionsRouter  from './routes/sessions.js';
import plansRouter     from './routes/plans.js';
import statsRouter     from './routes/stats.js';
import adminRouter     from './routes/admin.js';
import { requireAuth } from './middleware/auth.js';
import { localDate }   from './localDate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const { version } = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

// Restores carry a whole account's history — allow a larger body there only.
// (The global parser skips requests a previous parser already handled.)
app.use('/api/stats/import', express.json({ limit: '25mb' }));
app.use(express.json());
app.use(cookieParser());
app.use(localDate);

app.get('/api/version', (_req, res) => res.json({ version }));
app.use('/api/auth',      authRouter);
app.use('/api/exercises', requireAuth, exercisesRouter);
app.use('/api/schedule',  requireAuth, scheduleRouter);
app.use('/api/sessions',  requireAuth, sessionsRouter);
app.use('/api/plans',     requireAuth, plansRouter);
app.use('/api/stats',     requireAuth, statsRouter);
app.use('/api/admin',     adminRouter);

// 404 any /api/* path that didn't match a route above — prevents catch-all from serving index.html for missing API endpoints
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve built client in production
const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));

// Central error handler: malformed JSON is the client's fault (400); anything
// else is logged and returned as a JSON 500 rather than Express's HTML page.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  if (err.type === 'entity.too.large')    return res.status(413).json({ error: 'Request too large' });
  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
