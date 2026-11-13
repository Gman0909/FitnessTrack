import { Router } from 'express';
import { exec }   from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import db, { dbPath } from '../db.js';
import { backupDb } from '../backup.js';
import { registrationOpen } from './auth.js';

const router = Router();
const ROOT   = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// npm lives next to the node binary regardless of the system PATH
const npmBin = join(dirname(process.execPath), 'npm');

let updateStatus = { state: 'idle', log: '' };

router.use(requireAuth, requireAdmin);

router.get('/settings', (_req, res) => {
  res.json({ registration_open: registrationOpen() });
});

router.patch('/settings', (req, res) => {
  const { registration_open } = req.body;
  if (typeof registration_open !== 'boolean')
    return res.status(400).json({ error: 'registration_open must be true or false' });
  db.prepare(`INSERT INTO config (key, value) VALUES ('registration_open', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(registration_open ? '1' : '0');
  res.json({ registration_open: registrationOpen() });
});

router.get('/update-status', (req, res) => {
  res.json(updateStatus);
});

router.post('/update', (req, res) => {
  if (updateStatus.state === 'running') return res.json({ ok: true });

  // Snapshot the database before touching the code. If the snapshot fails,
  // don't update — the new version may migrate the schema on restart.
  let backup;
  try { backup = backupDb(db, dbPath, 'pre-update'); }
  catch (e) {
    updateStatus = { state: 'error', log: `Backup failed, update aborted: ${e.message}` };
    return res.json({ ok: true });
  }

  updateStatus = { state: 'running', log: '' };
  res.json({ ok: true });

  setTimeout(() => {
    // fetch + reset --hard (instead of git pull) so locally-regenerated files
    // on the deployment box (e.g. client/package-lock.json after an npm rebuild
    // of native deps like better-sqlite3 on ARM) don't block the update.
    // safe.directory is added only if missing — `--add` alone appends a
    // duplicate line to ~/.gitconfig on every update.
    const cmd = `(git config --global --get-all safe.directory | grep -qxF "${ROOT}" || git config --global --add safe.directory "${ROOT}") && git fetch origin && git reset --hard origin/HEAD && "${npmBin}" install && "${npmBin}" install --prefix client && "${npmBin}" run build`;
    exec(cmd, { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) {
        updateStatus = { state: 'error', log: (stderr || err.message || stdout).trim() };
        console.error('In-app update failed:\n', updateStatus.log);
        return;
      }
      updateStatus = { state: 'done', log: `${stdout.trim()}\nDatabase backup: ${backup}` };
      console.log('In-app update complete — restarting...');
      process.exit(1); // triggers Restart=on-failure / Restart=always in systemd
    });
  }, 300);
});

export default router;
