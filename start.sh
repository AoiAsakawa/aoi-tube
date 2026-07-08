#!/usr/bin/env bash
set -euo pipefail

# Ensure we're running from the repo root even if invoked elsewhere.
cd "$(dirname "$0")"

require_file() {
	local path="$1"
	if [ ! -f "$path" ]; then
		echo "Missing required file: $path" >&2
		echo "This file is required at build time due to Go //go:embed." >&2
		if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
			echo "If this is a git checkout, you can restore it with:" >&2
			echo "  git checkout -- $path" >&2
		else
			echo "Re-deploy the repository including the static/ assets." >&2
		fi
		exit 1
	fi
}

require_dir() {
	local path="$1"
	if [ ! -d "$path" ]; then
		echo "Missing required directory: $path" >&2
		echo "This directory is required at build time due to Go //go:embed." >&2
		if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
			echo "If this is a git checkout, you can restore it with:" >&2
			echo "  git checkout -- $path" >&2
		else
			echo "Re-deploy the repository including the static/ assets." >&2
		fi
		exit 1
	fi
}

require_file static/img/logo.png
require_dir static/img/emoji
require_file static/offline.tsclip

exec go run main.go