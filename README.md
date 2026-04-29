# FitnessTrack

A self-hosted progressive overload fitness tracker. Log workouts, track weight progression across sets and exercises, and let the algorithm handle when to increase load — no spreadsheets required.

---

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
git clone https://github.com/YOUR_USERNAME/FitnessTrack.git
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
git clone https://github.com/YOUR_USERNAME/FitnessTrack.git
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

Edit `scripts/fitnesstrack.service` and update `User` and `WorkingDirectory` to match your setup (default assumes user `pi` and path `/home/pi/FitnessTrack`). Then:

```bash
sudo cp scripts/fitnesstrack.service /etc/systemd/system/
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
git clone https://github.com/YOUR_USERNAME/FitnessTrack.git
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
git clone https://github.com/YOUR_USERNAME/FitnessTrack.git
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
