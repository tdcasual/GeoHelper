# Legacy Compile External Consumer Checklist

Status: archived

This checklist tracked the removal of the legacy `/api/v1/chat/compile` and
`/api/v2/agent/runs` surfaces for external consumers.

The route has been removed from the active gateway/control-plane stack, so this
document is retained only as an archived reference for historical rollout notes.

Archived notes:

- `/api/v1/chat/compile` was the old gateway compile endpoint.
- `/api/v2/agent/runs` was the old runtime run endpoint.
- downstream consumers must use the platform run flow instead of the removed
  legacy compile stack.
