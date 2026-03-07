#!/bin/sh
set -e

# Initialize config.json if it doesn't exist
if [ ! -f /data/config.json ]; then
  echo "Initializing default config.json..."
  echo '{}' > /data/config.json
fi

exec bun run --cwd packages/backend src/index.ts "$@"
