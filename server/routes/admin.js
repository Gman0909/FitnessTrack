import { Router } from 'express';
import { exec }   from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const ROOT   = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// npm lives next to the node binary regardless of the system PATH
const npmBin = join(dirname(process.execPath), 'npm');

let updateStatus = { state: 'idle', log: '' };

router.get('/update-status', requireAuth, (req, res) => {
  res.json(updateStatus);
});

router.post('/update', requireAuth, (req, res) => {
  if (updateStatus.state === 'running') return res.json({ ok: true });
  updateStatus = { state: 'running', log: '' };
  res.json({ ok: true });

  setTimeout(() => {
    const cmd = `git pull && "${npmBin}" install && "${npmBin}" install --prefix client && "${npmBin}" run build`;
    exec(cmd, { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) {
        updateStatus = { state: 'error', log: (stderr || err.message || stdout).trim() };
        console.error('In-app update failed:\n', updateStatus.log);
        return;
      }
      updateStatus = { state: 'done', log: stdout.trim() };
      console.log('In-app update complete — restarting...');
      process.exit(1); // triggers Restart=on-failure / Restart=always in systemd
    });
  }, 300);
});

export default router;
