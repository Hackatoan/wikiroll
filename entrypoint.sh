#!/bin/sh
set -e
echo "[WikiRoll] Registering slash commands..."
node src/deploy-commands.js
echo "[WikiRoll] Starting bot..."
exec node src/index.js
