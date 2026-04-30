#!/bin/bash
set -e

echo "=== FitnessTrack update ==="

# If the service is installed, warm up sudo credentials now before the long
# build steps, so the systemctl commands at the end don't prompt mid-run.
if systemctl is-enabled --quiet fitnesstrack 2>/dev/null; then
  sudo -v
fi

# Pull latest changes
echo "Pulling latest changes..."
git pull

# Install / update dependencies
echo "Installing dependencies..."
npm install
cd client && npm install && cd ..

# Rebuild the React client
echo "Building client..."
npm run build

echo ""
echo "Update complete."

# If the service file is already installed, refresh it in case node path or
# working directory changed, then restart.
if systemctl is-enabled --quiet fitnesstrack 2>/dev/null; then
  INSTALL_USER="$(whoami)"
  INSTALL_DIR="$(pwd)"
  NODE_BIN="$(command -v node)"

  sudo tee /etc/systemd/system/fitnesstrack.service > /dev/null <<EOF
[Unit]
Description=FitnessTrack
After=network.target

[Service]
Type=simple
User=${INSTALL_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_BIN} server/index.js
Restart=always
RestartSec=5
Environment=PORT=3001
Environment=DATABASE_PATH=${INSTALL_DIR}/fitness.db

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl restart fitnesstrack
  echo "Service restarted."
else
  echo "Run 'npm start' (or restart your service) to apply the update."
fi
