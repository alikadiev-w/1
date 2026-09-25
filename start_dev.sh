#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm is required. Install Node.js LTS from https://nodejs.org/"
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install
fi
npm run dev
