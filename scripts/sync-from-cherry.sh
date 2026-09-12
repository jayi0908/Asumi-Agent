#!/usr/bin/env bash
# Sync product sources from the fixed Cherry Studio baseline.
# Platform shell (src-tauri, src/bridge) is never overwritten.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHERRY="${CHERRY_PATH:-$HOME/codes/PULL/cherry-studio}"
BASELINE_FILE="$ROOT/docs/CHERRY_BASELINE"
EXPECTED="$(tr -d '[:space:]' <"$BASELINE_FILE")"

if [[ ! -d "$CHERRY/.git" ]]; then
  echo "Cherry path not found: $CHERRY" >&2
  exit 1
fi

ACTUAL="$(cd "$CHERRY" && git rev-parse HEAD)"
if [[ "$ACTUAL" != "$EXPECTED" ]]; then
  echo "Cherry HEAD ($ACTUAL) != pinned baseline ($EXPECTED)" >&2
  echo "Update docs/CHERRY_BASELINE only after intentional baseline bump." >&2
  exit 1
fi

RSYNC=(rsync -a --delete
  --exclude node_modules --exclude dist --exclude out --exclude .git
  --exclude '**/__tests__' --exclude '**/*.test.ts' --exclude '**/*.test.tsx'
  --exclude '**/*.spec.ts' --exclude '**/*.spec.tsx')

"${RSYNC[@]}" "$CHERRY/src/renderer/" "$ROOT/src/renderer/"
"${RSYNC[@]}" "$CHERRY/src/shared/" "$ROOT/src/shared/"
"${RSYNC[@]}" \
  --exclude 'migrations' \
  --exclude 'packages' \
  --exclude 'resources' \
  "$CHERRY/src/main/" "$ROOT/src/main/"
"${RSYNC[@]}" "$CHERRY/src/preload/" "$ROOT/src/preload/"
"${RSYNC[@]}" "$CHERRY/packages/" "$ROOT/packages/"
"${RSYNC[@]}" "$CHERRY/migrations/" "$ROOT/migrations/"
if [[ -d "$CHERRY/resources" ]]; then
  "${RSYNC[@]}" "$CHERRY/resources/" "$ROOT/resources/"
fi
if [[ -d "$CHERRY/patches" ]]; then
  "${RSYNC[@]}" "$CHERRY/patches/" "$ROOT/patches/"
fi
if [[ -d "$CHERRY/build" ]]; then
  "${RSYNC[@]}" "$CHERRY/build/" "$ROOT/build/"
fi

# Restore __dirname-based symlinks that rsync may have cleaned
[[ -L "$ROOT/src/main/migrations" ]] || ln -sf ../../migrations "$ROOT/src/main/migrations"
[[ -L "$ROOT/src/main/packages" ]]  || ln -sf ../../packages "$ROOT/src/main/packages"
[[ -L "$ROOT/src/main/resources" ]] || ln -sf ../../resources "$ROOT/src/main/resources"

# Platform-only injection: install window.api before Cherry renderer boot.
# Survives re-sync; do not put product logic here.
patch_entrypoint() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  if ! grep -q "@bridge/install" "$f"; then
    { echo "import '@bridge/install'"; cat "$f"; } >"$f.tmp" && mv "$f.tmp" "$f"
  fi
}

for f in \
  "$ROOT/src/renderer/windows/main/entryPoint.tsx" \
  "$ROOT/src/renderer/windows/settings/entryPoint.tsx" \
  "$ROOT/src/renderer/windows/quickAssistant/entryPoint.tsx" \
  "$ROOT/src/renderer/windows/subWindow/entryPoint.tsx" \
  "$ROOT/src/renderer/windows/migrationV2/entryPoint.tsx" \
  "$ROOT/src/renderer/windows/selection/toolbar/entryPoint.tsx" \
  "$ROOT/src/renderer/windows/selection/action/entryPoint.tsx"
do
  patch_entrypoint "$f"
done

echo "Synced Cherry $ACTUAL -> $ROOT (renderer/main/shared/preload/packages/migrations/resources)"
echo "Do not hand-edit synced trees; adapt only via src/bridge and src-tauri."
