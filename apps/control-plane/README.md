# Control Plane Local Runtime

## Inline worker

Run the control plane with its default inline worker loop:

```bash
pnpm --filter @geohelper/control-plane start
```

Health probes:

```bash
curl -fsS http://localhost:4310/api/v3/health
curl -fsS http://localhost:4310/api/v3/ready
```

## Durable SQLite ledger

Point both processes at the same SQLite ledger to keep runs, checkpoints, dispatches,
and resumable engine state across restarts:

```bash
export GEOHELPER_AGENT_STORE_SQLITE_PATH="$PWD/.data/agent-store.sqlite"
pnpm --filter @geohelper/control-plane start
```

## Standalone worker

Start a separate worker against the same ledger:

```bash
export GEOHELPER_AGENT_STORE_SQLITE_PATH="$PWD/.data/agent-store.sqlite"
pnpm --filter @geohelper/worker start
```

For a one-shot worker tick during debugging:

```bash
pnpm --filter @geohelper/worker start -- --once
```
