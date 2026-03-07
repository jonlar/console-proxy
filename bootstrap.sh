#!/usr/bin/env bash
# bootstrap.sh — initialize a new project from this template
#
# Usage:
#   ./bootstrap.sh <project-name> [target-dir]
#
# Examples:
#   ./bootstrap.sh my-service
#   ./bootstrap.sh my-service ~/projects/my-service

set -euo pipefail

PROJECT_NAME="${1:-}"
TARGET_DIR="${2:-${PROJECT_NAME}}"

# ── Validate ──────────────────────────────────────────────────────────────────
if [[ -z "$PROJECT_NAME" ]]; then
  echo "Usage: $0 <project-name> [target-dir]"
  exit 1
fi

if [[ ! "$PROJECT_NAME" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ ]]; then
  echo "Error: project name must be lowercase alphanumeric with hyphens (e.g. my-service)"
  exit 1
fi

if [[ -e "$TARGET_DIR" ]]; then
  echo "Error: '$TARGET_DIR' already exists"
  exit 1
fi

# ── Copy template files ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Creating project '$PROJECT_NAME' in '$TARGET_DIR'..."
cp -r "$SCRIPT_DIR" "$TARGET_DIR"
cd "$TARGET_DIR"

# Remove bootstrap script and git history from the new project
rm -f bootstrap.sh
rm -rf .git

# ── Substitute project name ────────────────────────────────────────────────────
FILES_TO_PATCH=(
  package.json
  packages/backend/package.json
  packages/frontend/package.json
  docker-compose.yml
  build-docker.sh
  packages/frontend/index.html
)

for f in "${FILES_TO_PATCH[@]}"; do
  if [[ -f "$f" ]]; then
    sed -i "s/my-app/$PROJECT_NAME/g" "$f"
  fi
done

# ── Git init ──────────────────────────────────────────────────────────────────
git init
git add .
git commit -m "chore: initialize $PROJECT_NAME from template"

# ── Install dependencies ───────────────────────────────────────────────────────
if command -v bun &>/dev/null; then
  bun install
else
  echo "Warning: bun not found. Run 'bun install' manually after installing bun."
fi

echo ""
echo "Done! Project '$PROJECT_NAME' is ready in '$TARGET_DIR'."
echo ""
echo "Next steps:"
echo "  cd $TARGET_DIR"
echo "  bun run dev:backend   # start the backend (port 3001)"
echo "  bun run dev:frontend  # start the frontend (port 3000)"
