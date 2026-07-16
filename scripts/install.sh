#!/usr/bin/env bash
set -euo pipefail

dry_run=0
configure_coordinator=0
live_test=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    --configure-coordinator) configure_coordinator=1 ;;
    --live-test) live_test=1 ;;
    -h|--help)
      printf '%s\n' 'Usage: bash ./scripts/install.sh [--dry-run] [--configure-coordinator] [--live-test]'
      exit 0
      ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
plugin_root="$repo_root/plugins/adaptive-router-for-codex"
marketplace_name='adaptive-router-for-codex'
selector='adaptive-router-for-codex@adaptive-router-for-codex'
codex_cli="$plugin_root/node_modules/@openai/codex/bin/codex.js"

command -v node >/dev/null 2>&1 || { printf '%s\n' 'Node.js is required.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { printf '%s\n' 'npm is required.' >&2; exit 1; }
node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
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
  (( configure_coordinator )) && printf '%s\n' 'DRY RUN: would back up config.toml, set gpt-5.6-luna with low effort, and enforce agents.max_depth=1'
  (( live_test )) && printf '%s\n' 'DRY RUN: would run authenticated Luna, Terra, and Sol worker smoke tests'
  printf '%s\n' 'Dry run completed without changing dependencies, plugin state, or global config.'
  exit 0
fi

printf '%s\n' '==> Install exact runtime dependencies'
(cd "$plugin_root" && npm ci --omit=dev --cache "$repo_root/.npm-cache")
[[ -f "$codex_cli" ]] || { printf 'Plugin-local Codex CLI was not installed at %s\n' "$codex_cli" >&2; exit 1; }

marketplace_json="$(node "$codex_cli" plugin marketplace list --json)"
existing_root="$(printf '%s' "$marketplace_json" | node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(0, "utf8"));
const matches = value.marketplaces.filter((item) => item.name === "adaptive-router-for-codex");
if (matches.length > 1) process.exit(3);
if (matches[0]) process.stdout.write(matches[0].root);
')" || { printf '%s\n' 'Multiple conflicting marketplace entries were found.' >&2; exit 1; }

if [[ -n "$existing_root" ]]; then
  normalized_existing="$(node -e 'const p=require("node:path"); process.stdout.write(p.resolve(process.argv[1]));' "$existing_root")"
  normalized_expected="$(node -e 'const p=require("node:path"); process.stdout.write(p.resolve(process.argv[1]));' "$repo_root")"
  if [[ "$normalized_existing" != "$normalized_expected" ]]; then
    printf "Marketplace %s already points to '%s', not '%s'. Refusing to overwrite the conflicting root.\n" "$marketplace_name" "$normalized_existing" "$normalized_expected" >&2
    exit 1
  fi
  printf '==> Marketplace already points to this repository: %s\n' "$normalized_expected"
else
  printf '==> Add local marketplace %s\n' "$marketplace_name"
  node "$codex_cli" plugin marketplace add "$repo_root" --json
fi

printf '==> Install or refresh %s\n' "$selector"
node "$codex_cli" plugin add "$selector" --json
printf '%s\n' '==> Run strict structural diagnostics'
node "$plugin_root/scripts/diagnose.mjs" --strict

plugins_json="$(node "$codex_cli" plugin list --available --json)"
printf '%s' "$plugins_json" | node -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(0, "utf8"));
const plugin = value.installed.find((item) => item.pluginId === "adaptive-router-for-codex@adaptive-router-for-codex");
if (!plugin?.enabled) throw new Error("Plugin is not installed and enabled.");
'

if (( configure_coordinator )); then
  printf '%s\n' '==> Back up and configure the Luna coordinator'
  node "$repo_root/scripts/configure-coordinator.mjs" "$HOME/.codex/config.toml"
fi

if (( live_test )); then
  printf '%s\n' '==> Run authenticated live worker tests'
  (cd "$plugin_root" && npm run test:live)
fi

printf '\n%s\n' 'Adaptive Router for Codex is installed and enabled.'
printf '%s\n' 'Restart the Codex app or start a new task to load the plugin.'
printf '%s\n' 'On the first trust prompt, run /hooks, inspect the Node hook command, and trust it once.'
