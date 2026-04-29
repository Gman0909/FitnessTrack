#!/bin/bash
set -e

echo "=== FitnessTrack update ==="

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

# Restart systemd service if it is running
if systemctl is-active --quiet fitnesstrack 2>/dev/null; then
  echo "Restarting fitnesstrack service..."
  sudo systemctl restart fitnesstrack
  echo "Service restarted."
else
  echo "Run 'npm start' (or restart your service) to apply the update."
fi
