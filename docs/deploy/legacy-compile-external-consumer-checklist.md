# Legacy Compile External Consumer Checklist

Archived historical note: the legacy compile route has been removed from the active runtime.

This document is kept only as context for the old migration from `POST /api/v1/chat/compile` to `POST /api/v2/agent/runs`.

## Status

1. `POST /api/v2/agent/runs` is the only active compile endpoint.
2. `POST /api/v1/chat/compile` has been removed.
3. The old operator checklist is archived and is no longer part of the active release workflow.

## Historical Purpose

This checklist used to confirm that no external caller still depended on the legacy `batch + agent_steps` shell before route removal.

## What Changed

1. The route has been removed.
2. The `ops:legacy-compile-check` command has been retired.
3. Active operator evidence should now focus on `/api/v2/agent/runs`, `/admin/compile-events`, and `/admin/traces/<trace-id>`.

## Historical Reference

If you need to understand the old cutover logic, read the dated plan history under `docs/plans/`.
