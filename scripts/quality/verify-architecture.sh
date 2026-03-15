#!/usr/bin/env bash

set -euo pipefail

BUILD_LOG="$(mktemp -t geohelper-build-log.XXXXXX)"
trap 'rm -f "$BUILD_LOG"' EXIT

pnpm lint
pnpm deps:check
pnpm typecheck
pnpm test -- --run
pnpm build:web 2>&1 | tee "$BUILD_LOG"
BUILD_WARNING_LOG="$BUILD_LOG" \
BUILD_WARNING_BASELINE="docs/architecture/maintainability-baseline.md" \
pnpm quality:build-warnings
