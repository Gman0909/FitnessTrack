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
