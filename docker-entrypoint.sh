#!/bin/sh
set -e

# Initialize config.json if it doesn't exist
if [ ! -f /data/config.json ]; then
    echo "Initializing empty config.json..."
    echo '{"ports":[]}' > /data/config.json
fi

# Execute the main command
exec bun run --cwd packages/backend src/index.ts "$@"
