# Legacy Compile External Consumer Checklist

Use this checklist before removing `POST /api/v1/chat/compile`.

The goal is not to prove that internal GeoHelper code has migrated. That part is already covered by the migration plan and automated tests. The goal here is to confirm that no external caller still depends on the legacy `batch + agent_steps` response shell.

## Goal

Authorize the final removal of `POST /api/v1/chat/compile` only after an operator has verified that external consumers have either:

1. already migrated to `POST /api/v2/agent/runs`, or
2. explicitly confirmed that they no longer depend on the legacy route.

## Preconditions

Before starting this checklist, confirm all of the following:

1. Internal runtime traffic already uses `/api/v2/agent/runs`.
2. Smoke, benchmark, and live-model scripts already use `/api/v2/agent/runs`.
3. Browser e2e fixtures already mock the `AgentRunEnvelope` contract.
4. The legacy route is still live and returns explicit deprecation headers:
   - `Deprecation: true`
   - `Link: </api/v2/agent/runs>; rel="successor-version"`
5. The deploy/runbook evidence surfaces are available:
   - `/admin/compile-events`
   - `/admin/traces/<trace-id>`
   - gateway access logs or CDN / reverse-proxy request logs

## Observation Window

Recommended default: observe production or the relevant shared gateway for 7 consecutive days after deprecation headers are live.

During that window, treat any confirmed external hit to `/api/v1/chat/compile` as a stop signal for route removal until the caller is identified and migrated.

## Evidence Collection

You can dry-run the evidence collection plan first:

```bash
pnpm ops:legacy-compile-check -- --dry-run
```

And run the summarized report against a live gateway:

```bash
GATEWAY_URL=https://<gateway-domain> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm ops:legacy-compile-check
```

The command writes a JSON artifact under `output/ops/<timestamp>/legacy-compile-check.json` so you can attach the result to the eventual sign-off.

### 1. Confirm the legacy route still advertises deprecation

Run one manual request and verify the compatibility shell is clearly marked deprecated:

```bash
curl -i -X POST \
  -H "content-type: application/json" \
  --data '{"message":"画一个圆","mode":"byok"}' \
  "https://<gateway-domain>/api/v1/chat/compile"
```

Expected headers include:

- `Deprecation: true`
- `Link: </api/v2/agent/runs>; rel="successor-version"`

This confirms external callers have an explicit machine-visible migration hint while the route still exists.

### 2. Query recent compile events and filter for legacy hits

If `ADMIN_METRICS_TOKEN` is enabled, collect recent compile events:

```bash
curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/compile-events?limit=200" | \
  jq '[.events[] | select(.path == "/api/v1/chat/compile")]'
```

You are looking for any entries where `.path == "/api/v1/chat/compile"`.

If the result is empty for the full observation window, that is strong evidence that no recent caller is using the legacy route.

If hits exist, record for each one:

1. `recordedAt`
2. `traceId`
3. `mode`
4. `finalStatus`
5. whether the hit was expected internal verification traffic or an unknown external caller

### 3. Drill into any suspicious trace

For each suspicious legacy hit, inspect the full trace:

```bash
curl -fsS -H "x-admin-token: <ADMIN_METRICS_TOKEN>" \
  "https://<gateway-domain>/admin/traces/<trace-id>"
```

Use this to distinguish expected smoke / manual validation from real external integration traffic.

### 4. Cross-check infrastructure logs

Compile-event retention proves the gateway saw the request, but access logs are usually the fastest way to identify the caller or origin path.

Examples:

```bash
rg -n 'POST /api/v1/chat/compile' /var/log/nginx/access.log
rg -n '/api/v1/chat/compile' /var/log/caddy/access.log
```

If you run behind a CDN, WAF, or hosted edge proxy, query that request log layer for `/api/v1/chat/compile` over the same 7 consecutive days.

### 5. Ask known integrators for explicit confirmation

Maintain a small confirmation table while the observation window is open:

| Consumer / Surface | Owner | Contact | Last Legacy Hit | Migrated To `/api/v2/agent/runs`? | Notes |
| --- | --- | --- | --- | --- | --- |
| Internal smoke / staging checks | GeoHelper operator | self | expected / known | yes | should no longer hit legacy route |
| External script / partner A |  |  |  |  |  |
| External script / partner B |  |  |  |  |  |
| Unknown log-only caller |  |  |  | no | investigate before removal |

If you cannot name the caller that hit `/api/v1/chat/compile`, do not proceed with route removal.

## Go / No-Go Criteria

You may approve route removal only when all items below are true:

1. The full 7 consecutive days observation window has completed.
2. `/admin/compile-events` shows no unexplained `.path == "/api/v1/chat/compile"` hits during that window.
3. Access logs / CDN logs show no unexplained `/api/v1/chat/compile` traffic during that window.
4. Known consumers have either migrated to `/api/v2/agent/runs` or explicitly confirmed they no longer use the legacy route.
5. Fresh migration verification is still green:
   - runtime smoke
   - benchmark smoke
   - relevant gateway tests
   - typecheck

If any item is false, the decision is `NO-GO`.

## Sign-off

Record the final decision in a lightweight release note or ticket with:

1. date and timezone
2. operator / approver name
3. observation window used
4. evidence links or attached command output
5. decision: `GO` or `NO-GO`
6. next step:
   - `GO`: start Task 5 final cut
   - `NO-GO`: keep the legacy route and continue migration outreach

Suggested sign-off template:

```text
Legacy compile external consumer check
Date:
Operator:
Window:
Legacy hits observed:
Known external consumers:
Decision:
Notes:
```

## Rollback

If any external dependency is discovered before the route is removed:

1. keep `/api/v1/chat/compile` enabled
2. continue returning the deprecation headers
3. contact the owner of the remaining caller
4. restart the observation window after that caller migrates

If the route has already been removed and a missed consumer is discovered:

1. roll back to the last gateway release that still registers `/api/v1/chat/compile`
2. announce the breakage to the affected owner
3. reopen the migration plan and treat the removal as not yet approved
