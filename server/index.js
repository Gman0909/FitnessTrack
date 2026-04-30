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
import settingsRouter  from './routes/settings.js';
import { requireAuth } from './middleware/auth.js';
import { seed }        from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3001;
const { version } = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

app.use(express.json());
app.use(cookieParser());

app.get('/api/version', (_req, res) => res.json({ version }));
app.use('/api/auth',      authRouter);
app.use('/api/exercises', requireAuth, exercisesRouter);
app.use('/api/schedule',  requireAuth, scheduleRouter);
app.use('/api/sessions',  requireAuth, sessionsRouter);
app.use('/api/plans',     requireAuth, plansRouter);
app.use('/api/stats',     requireAuth, statsRouter);
app.use('/api/admin',     adminRouter);
app.use('/api/settings',  requireAuth, settingsRouter);

// 404 any /api/* path that didn't match a route above — prevents catch-all from serving index.html for missing API endpoints
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve built client in production
const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));

seed();
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
