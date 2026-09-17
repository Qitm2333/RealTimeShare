#!/bin/bash

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="$SCRIPT_DIR/Torras Live Interaction.app"

echo "TORRAS Live Interaction - first launch helper"
echo

if [[ ! -d "$APP_PATH" ]]; then
  echo "Cannot find Torras Live Interaction.app next to this helper."
  echo "Keep the helper and the app in the same folder, then try again."
  echo
  read -r -p "Press Return to close..." _
  exit 1
fi

echo "Removing the download quarantine flag from:"
echo "$APP_PATH"

# This changes only the quarantine attribute on the bundled app.
/usr/bin/xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true

if /usr/bin/xattr -lr "$APP_PATH" 2>/dev/null | /usr/bin/grep -q "com.apple.quarantine"; then
  echo
  echo "The quarantine flag could not be removed."
  echo "Move both files to a writable folder and try again."
  echo
  read -r -p "Press Return to close..." _
  exit 1
fi

echo "Opening Torras Live Interaction..."
/usr/bin/open "$APP_PATH"
