#!/bin/bash
set -e

echo "=== FitnessTrack setup ==="

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "Node.js not found. Installing via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Node $(node --version)"

echo "Installing dependencies..."
npm install
cd client && npm install && cd ..

echo "Building client..."
npm run build

echo "Setting up database..."
npm run setup

echo ""
echo "Setup complete."
echo "Run 'npm start' to launch FitnessTrack on port 3001."
echo "To change the port: PORT=8080 npm start"
echo ""

# Offer to install systemd service
if command -v systemctl &>/dev/null; then
  read -r -p "Install as a systemd service (auto-start on boot)? [y/N] " REPLY
  if [[ "$REPLY" =~ ^[Yy]$ ]]; then
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
Restart=on-failure
RestartSec=5
Environment=PORT=3001
Environment=DATABASE_PATH=${INSTALL_DIR}/fitness.db

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable fitnesstrack
    sudo systemctl start fitnesstrack
    echo ""
    echo "Service installed and started."
    echo "  Status : sudo systemctl status fitnesstrack"
    echo "  Logs   : sudo journalctl -u fitnesstrack -f"
    echo "  Stop   : sudo systemctl stop fitnesstrack"
  fi
fi
