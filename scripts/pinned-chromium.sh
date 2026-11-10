#!/usr/bin/env bash
# Installs the exact Chromium that the pinned @playwright/test expects (node_modules/playwright-core/
# browsers.json), for sandboxes where `npx playwright install` cannot reach cdn.playwright.dev.
# Playwright's Chromium is "Chrome for Testing": the same zips are published by Google at
# storage.googleapis.com/chrome-for-testing-public/<version>/linux64/. The build is checked after
# extraction (`--version` must equal the pinned browserVersion) and nothing else is touched.
#
#   scripts/pinned-chromium.sh <dir>
#   PLAYWRIGHT_BROWSERS_PATH=<dir> npx playwright test …
set -euo pipefail
cd "$(dirname "$0")/.."
dest="${1:?usage: scripts/pinned-chromium.sh <install dir>}"
meta=node_modules/playwright-core/browsers.json
[ -f "$meta" ] || { echo "run npm ci first ($meta missing)" >&2; exit 1; }
read -r rev ver < <(node -e 'const b=require("./'"$meta"'").browsers.find(x=>x.name==="chromium");console.log(b.revision,b.browserVersion)')
hrev=$(node -e 'console.log(require("./'"$meta"'").browsers.find(x=>x.name==="chromium-headless-shell").revision)')
base="https://storage.googleapis.com/chrome-for-testing-public/$ver/linux64"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$dest"
install_one() { # <zip name> <target dir> <binary path inside target>
  local zip="$1" dir="$2" bin="$3"
  if [ -x "$dir/$bin" ] && "$dir/$bin" --version | grep -qF "$ver"; then echo "present: $dir"; return; fi
  rm -rf "$dir" && mkdir -p "$dir"
  curl -sSfL -o "$tmp/$zip" "$base/$zip"
  unzip -q "$tmp/$zip" -d "$dir"
  "$dir/$bin" --version | grep -qF "$ver" || { echo "version check failed for $dir" >&2; exit 1; }
  touch "$dir/DEPENDENCIES_VALIDATED" "$dir/INSTALLATION_COMPLETE"
  echo "installed: $dir ($ver)"
}
install_one chrome-linux64.zip "$dest/chromium-$rev" chrome-linux64/chrome
install_one chrome-headless-shell-linux64.zip "$dest/chromium_headless_shell-$hrev" chrome-headless-shell-linux64/chrome-headless-shell
