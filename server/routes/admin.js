import { Router } from 'express';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

router.post('/update', requireAuth, (req, res) => {
  res.json({ ok: true });
  // Respond first, then run update in background so the response is sent before we restart
  setTimeout(() => {
    exec(
      'git pull && npm install && npm install --prefix client && npm run build',
      { cwd: ROOT },
      (err, _stdout, stderr) => {
        if (err) {
          console.error('In-app update failed:\n', stderr || err.message);
          return;
        }
        console.log('In-app update complete — restarting...');
        process.exit(0);
      }
    );
  }, 300);
});

export default router;
