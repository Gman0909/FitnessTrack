#!/bin/sh
set -e
# Seed exercises on first run (INSERT OR IGNORE keeps it safe to rerun)
node server/seed.js
exec node server/index.js
