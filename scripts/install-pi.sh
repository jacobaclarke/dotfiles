#!/usr/bin/env bash
set -euo pipefail

if ! command -v pi >/dev/null 2>&1; then
  printf '%s\n' 'Install Pi first: https://pi.dev/' >&2
  exit 1
fi

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# Pi merges this package into personal settings; it does not replace them.
pi install "$repo_root"
printf '%s\n' 'Planning installed. Use /reload in existing Pi sessions, or start a new session.'
