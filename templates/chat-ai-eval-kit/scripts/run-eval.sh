#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

MODE="${1:-full}"
case "$MODE" in
  smoke)
    npm run smoke
    ;;
  full|*)
    npm run eval:ci
    ;;
esac

node scripts/render-baseline-report.mjs
echo "Done. See reports/"
