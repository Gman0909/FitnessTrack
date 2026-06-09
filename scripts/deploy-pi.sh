#!/usr/bin/env bash
#
# Deploy FitnessTrack to the Raspberry Pi (pull → install → build → restart).
#
# The Pi runs `npm install`, which rewrites package-lock.json to add its
# ARM/native binaries. Those regenerable edits then block the next `git pull`.
# This script discards the lockfile drift before pulling so the deploy never
# wedges on it.
#
# Config (PI_HOST, PI_PATH) is read from scripts/deploy.env (git-ignored) or the
# environment — no infra details are committed to this public repo.
#
#   PI_HOST=user@host  PI_PATH=/path/to/FitnessTrack
#
# Usage:  ./scripts/deploy-pi.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
[ -f "${HERE}/deploy.env" ] && source "${HERE}/deploy.env"

: "${PI_HOST:?Set PI_HOST (e.g. user@host) in scripts/deploy.env or the environment}"
: "${PI_PATH:?Set PI_PATH (remote project path) in scripts/deploy.env or the environment}"

echo "→ Deploying to ${PI_HOST}:${PI_PATH}"

ssh "${PI_HOST}" "set -e
  cd '${PI_PATH}'
  # discard regenerable lockfile drift so the pull can fast-forward
  git checkout -- package-lock.json client/package-lock.json 2>/dev/null || true
  git pull
  npm install
  cd client && npm run build && cd ..
  sudo systemctl restart fitnesstrack
  sleep 2
  systemctl is-active fitnesstrack"

echo "→ Health check"
curl -fsS -o /dev/null -w 'Pi HTTP %{http_code}\n' --max-time 15 "http://${PI_HOST#*@}:3001/"
echo "✓ Deploy complete"
