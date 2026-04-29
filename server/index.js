import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRouter     from './routes/auth.js';
import exercisesRouter from './routes/exercises.js';
import scheduleRouter  from './routes/schedule.js';
import sessionsRouter  from './routes/sessions.js';
import plansRouter     from './routes/plans.js';
import statsRouter     from './routes/stats.js';
import { requireAuth } from './middleware/auth.js';
import { seed }        from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth',      authRouter);
app.use('/api/exercises', requireAuth, exercisesRouter);
app.use('/api/schedule',  requireAuth, scheduleRouter);
app.use('/api/sessions',  requireAuth, sessionsRouter);
app.use('/api/plans',     requireAuth, plansRouter);
app.use('/api/stats',     requireAuth, statsRouter);

// Serve built client in production
const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));

seed();
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
