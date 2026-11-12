#!/usr/bin/env bash
set -e

echo "Installing agy-pick..."

TARGET_DIR="${HOME}/.local/bin"
mkdir -p "${TARGET_DIR}"

RAW_BASE_URL="https://raw.githubusercontent.com/tmogeid/agy-pick/main"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"

if [ -f "${SCRIPT_DIR}/bin/agy-pick.js" ]; then
    echo "Installing from local repository..."
    cp "${SCRIPT_DIR}/bin/agy-pick.js" "${TARGET_DIR}/agy-pick"
else
    echo "Downloading latest release from GitHub..."
    curl -fsSL "${RAW_BASE_URL}/bin/agy-pick.js" -o "${TARGET_DIR}/agy-pick"
fi

chmod +x "${TARGET_DIR}/agy-pick"

echo ""
echo "✓ agy-pick installed successfully to: ${TARGET_DIR}/agy-pick"
echo "Make sure ${TARGET_DIR} is in your PATH."
echo "You can now run:"
echo "  agy-pick"
echo "  agy-pick --list"
