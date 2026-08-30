#!/usr/bin/env bash
set -euo pipefail

dry_run=0
live_test=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    --live-test) live_test=1 ;;
    -h|--help)
      printf '%s\n' 'Usage: bash ./scripts/install-claude.sh [--dry-run] [--live-test]'
      exit 0
      ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
plugin_root="$repo_root/plugins/adaptive-router-for-claude"
marketplace_name='adaptive-router-for-claude'
selector='adaptive-router-for-claude@adaptive-router-for-claude'

command -v node >/dev/null 2>&1 || { printf '%s\n' 'Node.js is required.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { printf '%s\n' 'npm is required.' >&2; exit 1; }
command -v claude >/dev/null 2>&1 || { printf '%s\n' 'The claude CLI is required. Install Claude Code first: https://code.claude.com/docs/en/quickstart' >&2; exit 1; }
node_major="$(node -p 'Number(process.versions.node.split(".")[0])' | sed 's/\x1b\[[0-9;]*m//g')"
if (( node_major < 22 )); then
  printf 'Node.js 22 or newer is required. Found %s\n' "$(node --version)" >&2
  exit 1
fi

printf '%s\n' '==> Run structural diagnostics'
node "$plugin_root/scripts/diagnose.mjs"

if (( dry_run )); then
  printf 'DRY RUN: would run npm ci --omit=dev in %s\n' "$plugin_root"
  printf 'DRY RUN: would add or confirm marketplace %s at %s\n' "$marketplace_name" "$repo_root"
  printf 'DRY RUN: would install and enable %s\n' "$selector"
  (( live_test )) && printf '%s\n' 'DRY RUN: would run authenticated Haiku, Sonnet, and Opus worker smoke tests'
  printf '%s\n' 'Dry run completed without changing dependencies or plugin state.'
  exit 0
fi

printf '%s\n' '==> Install exact runtime dependencies'
(cd "$plugin_root" && npm ci --omit=dev --cache "$repo_root/.npm-cache")

marketplace_json="$(claude plugin marketplace list --json)"
existing_location="$(printf '%s' "$marketplace_json" | node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(0, "utf8"));
const matches = value.filter((item) => item.name === "adaptive-router-for-claude");
if (matches.length > 1) process.exit(3);
if (matches[0]) process.stdout.write(matches[0].installLocation || matches[0].path || "");
')" || { printf '%s\n' 'Multiple conflicting marketplace entries were found.' >&2; exit 1; }

if [[ -n "$existing_location" ]]; then
  normalized_existing="$(node -e 'const p=require("node:path"); process.stdout.write(p.resolve(process.argv[1]));' "$existing_location")"
  normalized_expected="$(node -e 'const p=require("node:path"); process.stdout.write(p.resolve(process.argv[1]));' "$repo_root")"
  if [[ "$normalized_existing" != "$normalized_expected" ]]; then
    printf "Marketplace %s already points to '%s', not '%s'. Refusing to overwrite the conflicting root.\n" "$marketplace_name" "$normalized_existing" "$normalized_expected" >&2
    exit 1
  fi
  printf '==> Marketplace already points to this repository: %s\n' "$normalized_expected"
else
  printf '==> Add local marketplace %s\n' "$marketplace_name"
  claude plugin marketplace add "$repo_root"
fi

printf '==> Install or refresh %s\n' "$selector"
claude plugin install "$selector"
printf '%s\n' '==> Run strict structural diagnostics'
node "$plugin_root/scripts/diagnose.mjs" --strict

plugins_json="$(claude plugin list --available --json)"
printf '%s' "$plugins_json" | node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(0, "utf8"));
const entries = Array.isArray(value) ? value : (value.installed ?? value.plugins ?? []);
const plugin = entries.find((item) => (item.pluginId ?? `${item.name}@${item.marketplace}`) === "adaptive-router-for-claude@adaptive-router-for-claude");
if (!plugin) throw new Error("Plugin was not found after install. Verify with: claude plugin list --json");
if (plugin.enabled === false) throw new Error("Plugin is installed but not enabled. Run: claude plugin enable adaptive-router-for-claude@adaptive-router-for-claude");
'

if (( live_test )); then
  printf '%s\n' '==> Run authenticated live worker tests'
  (cd "$plugin_root" && npm run test:live)
fi

printf '\n%s\n' 'Adaptive Router for Claude Code is installed and enabled.'
printf '%s\n' 'Restart Claude Code or start a new session to load the plugin.'
printf '%s\n' 'On the first trust prompt, run /hooks, inspect the Node hook command, and trust it once.'
