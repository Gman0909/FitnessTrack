# FitnessTrack

A self-hosted progressive overload fitness tracker designed for resistance trainint. Log workouts, track progression across sets and exercises, and let the algorithm handle when to increase load — no spreadsheets or subscriptions required. 

---

| <img width="398" height="768" alt="Screenshot 2026-05-01 065812 (Medium)" src="https://github.com/user-attachments/assets/d671a906-dbee-4347-8338-2f3362f584e3" /> | <img width="394" height="768" alt="Screenshot 2026-05-01 065851 (Medium)" src="https://github.com/user-attachments/assets/a42cf1b7-8edc-44d0-b97c-a6ba0022d9bd" /> | <img width="396" height="768" alt="Screenshot 2026-05-01 065734 (Medium)" src="https://github.com/user-attachments/assets/ef5f2243-1bf8-4a10-a4f2-425cf770bb6d" /><br> |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |



## Features

- **Progressive overload algorithm** — automatically calculates target weight and reps for each set based on your last session, with modifiers for pain, recovery, and pump
- **Workout plans** — create named plans with configurable training days and exercises; run multiple plans (one active at a time)
- **Calendar view** — see every workout in a grid across weeks; navigate to any past or future session
- **Per-session logging** — log weight and reps per set; skip individual sets or entire sessions
- **Check-in system** — after each muscle group, rate pain, recovery, and pump to fine-tune the next session's targets
- **Exercise history** — per-exercise weight progression chart
- **Plan cycling** — when you finish the last session of a plan, the app prompts you to clone it into a new cycle with optional seed weights from any past week
- **Multi-user** — each user has their own account, plans, and data; no data is shared between users
- **Equipment filter** — select your available equipment; the exercise picker only shows relevant exercises
- **Custom exercises** — create exercises not in the built-in library
- **Weight units** — switch between kg and lbs; conversions are display-only, data is always stored in kg
- **Dark theme** — designed for gym lighting

---

## How the algorithm works

After every muscle group is logged, a check-in modal collects four ratings. Those ratings are summed into a single **modifier** that shapes the next session's targets.

### Rating scores

| Category | Option | Score |
|---|---|---|
| **Pain** | None | 0 |
| | Low | −1 |
| | Medium | −2 |
| | High | *suspend — all targets held unchanged* |
| **Recovery** | Never sore | +1 |
| | Healed / Just in time | 0 |
| | Still sore | −1 |
| **Pump** | Poor | +1 |
| | OK / Great | 0 |
| **Intensity** | Too easy | +2 |
| | Just right | 0 |
| | Too much | −2 |

The modifier is the sum of all four scores (range −5 to +4).

### Progression rules

| Situation | What happens |
|---|---|
| Pain = High | Hold all targets unchanged |
| Modifier ≤ −3 | **Deload** — weight −10%, reps reset to range minimum |
| Heaviest set hit the rep ceiling | **Bump weight** by one increment; reps recalculated to preserve volume |
| Missed target reps by more than 1 | Hold (no rep or weight change) |
| Otherwise | +1 rep |

After the base decision, the modifier adjusts reps further (+1 per point above 0, −1 per point below). Positive signals are scaled by the **progression** setting (Slow ×0.5, Normal ×1.0, Fast ×1.5). If the modifier would push reps past the ceiling without a weight bump, the bump triggers automatically.

Weight changes are applied **proportionally across all sets**, preserving pyramid and drop-set structure. Weights are rounded to the nearest 0.5 kg and capped at a 10% jump per session.

### Worked examples (standard rep range 8–12, barbell bench, normal progression)

| Scenario | Ratings | Modifier | Outcome |
|---|---|---|---|
| Crushed it — logged 12 reps, felt way too easy | Pain: none, Recovery: never sore, Pump: OK, Intensity: too easy | 0 + 1 + 0 + 2 = **+3** | Hit ceiling (12 reps) → weight +2.5 kg, reps recalculated to preserve volume; +3 modifier adds 3 more reps |
| Solid session — logged 10 of 10 reps | Pain: none, Recovery: healed, Pump: OK, Intensity: just right | **0** | +1 rep (11 next session) |
| Tough session — missed reps, still sore | Pain: low, Recovery: still sore, Pump: OK, Intensity: too much | −1 + −1 + 0 + −2 = **−4** | Modifier ≤ −3 → deload: weight −10%, reps reset to 8 |

### Per-muscle-group settings

| Setting | Options |
|---|---|
| **Rep range** | Powerlifting (5–8), Standard (8–12), Volume (12–15) |
| **Progression** | Slow (×0.5 on positive signals), Normal (×1.0), Fast (×1.5) |
| **Pause weight** | Blocks weight increases — only reps progress |

Bodyweight exercises (pull-ups, dips, etc.) follow the same rep-progression logic but have no weight axis.

---

## Tech stack

| Layer | Technology |
|---|---|
| Server | Node.js 20+, Express 4 |
| Database | SQLite (via `better-sqlite3`) |
| Auth | JWT in httpOnly cookies, bcrypt password hashing |
| Client | React 18, Vite 5, react-router-dom 6 |
| Charts | Recharts |

**How serving works:** The Express server on port 3001 serves both the API and the compiled React client — but only once the client has been built (`npm run build`). The built files live in `client/dist/`, which is not committed to the repository. The setup scripts for each platform run the build step automatically. In development (Option 4), the client is served by Vite on port 5173 instead, which proxies API calls to the Express server on 3001.

---

## Installation

### Option 1 — Docker (recommended for all platforms)

Docker is the easiest and most consistent deployment method. It works on Windows, Linux, and Raspberry Pi without any manual dependency management.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) or Docker Engine (Linux/Pi — see below).

```bash
git clone https://github.com/Gman0909/FitnessTrack.git
cd FitnessTrack
docker-compose up -d
```

The build runs automatically inside Docker (including the React client). Once complete, the app — frontend and API — is available at `http://localhost:3001`.

> **Important:** Docker builds `better-sqlite3` (a native addon) inside the container for the target architecture. Always build on the machine you intend to run on. Cross-compilation is not supported by the default setup.

**To stop:** `docker-compose down`  
**Data** is stored in a Docker volume (`fitness_data`) and persists across container restarts and rebuilds.  
**To change the port:** set `PORT=8080` in a `.env` file in the project root before running `docker-compose up`.

---

### Option 2 — Raspberry Pi (native, no Docker)

Tested on Raspberry Pi OS (Bookworm/Bullseye), Raspberry Pi 3 and 4.

#### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # should print v20.x.x or higher
```

#### 2. Clone and set up

```bash
git clone https://github.com/Gman0909/FitnessTrack.git
cd FitnessTrack
bash scripts/setup.sh
```

This installs dependencies, **builds the React client into `client/dist/`**, and seeds the exercise library. The build step is required — without it the server has no frontend to serve.

#### 3. Run

```bash
npm start
```

The app — frontend and API — is available at `http://localhost:3001`, or from other devices on your network at `http://<pi-ip-address>:3001`.

#### 4. Run as a system service (auto-start on boot)

The setup script handles this automatically — at the end of `bash scripts/setup.sh` it will ask if you want to install the service. It detects your username, working directory, and Node.js path automatically.

If you skipped that step or need to reinstall the service manually:

```bash
bash scripts/setup.sh   # re-run and answer yes to the service prompt
```

Or install manually (replace the values to match your system):

```bash
sudo tee /etc/systemd/system/fitnesstrack.service > /dev/null <<EOF
[Unit]
Description=FitnessTrack
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$(pwd)
ExecStart=$(which node) server/index.js
Restart=on-failure
RestartSec=5
Environment=PORT=3001
Environment=DATABASE_PATH=$(pwd)/fitness.db

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable fitnesstrack
sudo systemctl start fitnesstrack
```

**Check status:** `sudo systemctl status fitnesstrack`  
**View logs:** `sudo journalctl -u fitnesstrack -f`

#### Install Docker on Raspberry Pi (if you prefer Option 1)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

Then follow the Docker instructions above.

---

### Option 3 — Windows (native, no Docker)

**Prerequisites:** [Node.js 20 LTS](https://nodejs.org/) (includes npm). During installation, check the box to install build tools (required for `better-sqlite3`).

#### 1. Clone and set up

Open Command Prompt or PowerShell:

```cmd
git clone https://github.com/Gman0909/FitnessTrack.git
cd FitnessTrack
scripts\setup.bat
```

This installs dependencies, **builds the React client into `client\dist\`**, and seeds the exercise library. The build step is required — without it the server has no frontend to serve.

#### 2. Run

```cmd
scripts\start.bat
```

Or directly:

```cmd
npm start
```

The app — frontend and API — is available at `http://localhost:3001`.

#### Run as a Windows background service

Install [NSSM](https://nssm.cc/) (Non-Sucking Service Manager), then:

```cmd
nssm install FitnessTrack "C:\Program Files\nodejs\node.exe" "server\index.js"
nssm set FitnessTrack AppDirectory "C:\path\to\FitnessTrack"
nssm set FitnessTrack AppEnvironmentExtra PORT=3001
nssm start FitnessTrack
```

---

### Option 4 — Development setup

Use this if you want to modify the code. Vite's dev server provides hot-reload for the client.

> **Note:** In development, the frontend runs on **port 5173** (Vite), not 3001. Port 3001 is the API only. Vite proxies all `/api` requests to the Express server automatically.

```bash
git clone https://github.com/Gman0909/FitnessTrack.git
cd FitnessTrack
npm run install:all   # installs both server and client dependencies
npm run setup         # create database and seed exercises
```

Then open two terminals:

```bash
# Terminal 1 — API server (port 3001)
npm run dev

# Terminal 2 — React dev server with hot-reload (port 5173)
cd client && npm run dev
```

Open **`http://localhost:5173`** in your browser.

---

## Configuration

Copy `.env.example` to `.env` and edit as needed:

```env
PORT=3001
DATABASE_PATH=./fitness.db
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the server listens on |
| `DATABASE_PATH` | `./fitness.db` | Path to the SQLite database file |

In Docker, `DATABASE_PATH` defaults to `/data/fitness.db` inside a persistent volume.

---

## Remote access

To access FitnessTrack from your phone or outside your home network without opening router ports, use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
# Install cloudflared on Pi or your server machine
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared

# Start a temporary public tunnel (no account needed for quick testing)
cloudflared tunnel --url http://localhost:3001
```

This prints a temporary `https://xxxx.trycloudflare.com` URL you can open on any device. For a permanent URL, [create a free Cloudflare account](https://dash.cloudflare.com/sign-up) and set up a named tunnel.

---

## HTTPS (self-hosted, LAN or public)

FitnessTrack runs plain HTTP by default. If you need HTTPS — for example, to allow browsers to use the camera or vibration API, or to access the app from outside your network securely — you have two options:

### Option A — Caddy (simplest, auto-HTTPS)

[Caddy](https://caddyserver.com/) handles TLS certificates automatically via Let's Encrypt.

```bash
# Install Caddy (Debian/Ubuntu/Pi)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Create `/etc/caddy/Caddyfile`:

```
your-domain.com {
    reverse_proxy localhost:3001
}
```

Then: `sudo systemctl reload caddy`

Caddy automatically obtains and renews the certificate. Replace `your-domain.com` with your actual domain (must be publicly reachable for Let's Encrypt).

### Option B — nginx + Let's Encrypt (Raspberry Pi / Linux)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Create site config
sudo tee /etc/nginx/sites-available/fitnesstrack <<'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/fitnesstrack /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Obtain certificate (requires domain pointing to this machine)
sudo certbot --nginx -d your-domain.com
```

Certbot modifies the nginx config to add HTTPS and sets up automatic renewal.

### LAN-only HTTPS (no domain required)

For LAN access only, use a self-signed certificate or [mkcert](https://github.com/FiloSottile/mkcert). Note that browsers will show a warning for self-signed certs unless you import the CA into your devices.

---

## First run

1. Navigate to the app in a browser
2. Click **Register** and create your account (name, avatar glyph, username, password)
3. Go to **Setup** → select the equipment you have access to
4. Go to **Plans** → create a new plan, choose your training days
5. Click into the plan → **Configure** → add exercises to each day
6. Click **Activate** on the plan
7. Go to **Workout** — your first session is ready to log

---

## Updating

**In-app (Linux / Raspberry Pi with systemd service):**

If FitnessTrack is running as a systemd service, you can update it without a terminal. Navigate to **Setup** in the app → scroll to the bottom → click **Check for updates**. The app pulls the latest code, rebuilds the client, and restarts itself automatically. The page will reload once the new version is live.

> This requires the server to be running under systemd with `Restart=on-failure` so the process manager brings it back up after the restart.

**Linux / Raspberry Pi (terminal)** — run the update script (pulls, rebuilds, and restarts the systemd service if active):

```bash
bash scripts/update.sh
```

Or with the npm alias: `npm run update`

**Windows:**

```cmd
scripts\update.bat
```

Then restart the server manually (`npm start`, or `nssm restart FitnessTrack` if running as a service).

**Manual steps (any platform):**

```bash
git pull
npm run install:all
npm run build
# Restart the server
```

With Docker:

```bash
git pull
docker-compose up -d --build
```

The exercise library (`server/seed.js`) is seeded automatically every time the server starts. New exercises added in updates will appear in your library after a restart — no manual migration needed. Existing exercises and all user data are preserved.

**Custom exercises** you create in the app are stored only in your local `fitness.db` and are never overwritten by updates.

---

## Data

All data is stored in a single SQLite file (`fitness.db` by default). To back it up, copy that file while the server is stopped. To restore, replace the file and restart.

```bash
# Backup
cp fitness.db fitness.db.backup

# With Docker (copy out of the volume)
docker run --rm -v fitnesstrack_fitness_data:/data -v $(pwd):/backup alpine \
  cp /data/fitness.db /backup/fitness.db.backup
```
