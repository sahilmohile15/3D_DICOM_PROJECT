#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' is not available in PATH. Please install it and retry."
    exit 1
  fi
}

require_cmd python3
require_cmd npm

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment at: $VENV_DIR"
  python3 -m venv "$VENV_DIR"
else
  echo "Using existing virtual environment at: $VENV_DIR"
fi

VENV_PYTHON="$VENV_DIR/bin/python"
if [ ! -x "$VENV_PYTHON" ]; then
  echo "Error: virtual environment python executable not found at $VENV_PYTHON"
  exit 1
fi

echo
echo "> Installing backend dependencies"
"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r "$BACKEND_DIR/requirements.txt"

echo
echo "> Applying backend migrations"
"$VENV_PYTHON" "$BACKEND_DIR/manage.py" migrate

echo
echo "> Installing frontend dependencies"
cd "$FRONTEND_DIR"
npm install

echo
echo "Setup complete."
echo "Start backend: cd backend ; .venv/bin/python manage.py runserver"
echo "Start frontend: cd frontend ; npm run dev"
