# GeoHelper API Contract (M0/M1 + security + M2 orchestration)

## Common

- Base URL: `http://<gateway-host>`
- Content-Type: `application/json`

## GET /api/v1/health

### Response 200

```json
{
  "status": "ok",
  "time": "2026-03-04T15:00:00Z"
}
```

## GET /api/v1/ready

Readiness is deeper than liveness: it probes configured runtime dependencies such as Redis when `REDIS_URL` is enabled.

### Response 200

```json
{
  "ready": true,
  "dependencies": []
}
```

### Response 503

```json
{
  "ready": false,
  "dependencies": [
    {
      "name": "redis",
      "ok": false,
      "detail": "REDIS_UNAVAILABLE"
    }
  ]
}
```

## POST /api/v1/auth/token/login

### Request

```json
{
  "token": "geo-allow",
  "device_id": "device-123"
}
```

### Response 200

```json
{
  "session_token": "<token>",
  "expires_in": 1800,
  "token_type": "Bearer"
}
```

### Error 401

```json
{
  "error": {
    "code": "INVALID_PRESET_TOKEN",
    "message": "Token is invalid"
  }
}
```

## POST /api/v1/auth/token/revoke

### Headers

- `Authorization: Bearer <session_token>`

### Response 200

```json
{
  "revoked": true
}
```

### Error 401

```json
{
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "Session token is invalid or expired"
  }
}
```

## Backup Envelope (storage contract only, public routes pending)

Gateway V4 Task4 adds validated single-tenant backup storage groundwork only. Public admin backup routes are not available until the next task, but the stored envelope shape is already fixed so web and gateway can share one format.

```json
{
  "schema_version": 2,
  "created_at": "2026-03-11T15:40:00.000Z",
  "app_version": "0.0.1",
  "checksum": "abcd1234",
  "conversations": [
    { "id": "conv-1", "title": "Lesson 1" }
  ],
  "settings": {
    "chat_snapshot": {},
    "settings_snapshot": {},
    "ui_preferences": {}
  }
}
```

Retention model in gateway storage:

- one latest full backup envelope
- one bounded summary history for operator audit
- Redis-backed when `REDIS_URL` is configured, in-memory fallback otherwise

## POST /api/v2/agent/runs

### Headers

- Official mode: `Authorization: Bearer <session_token>`
- BYOK mode: optional `x-byok-endpoint`, `x-byok-key`

No legacy `x-client-*` experiment headers are required on this route. During cutover, those compatibility flags remain supported only on `/api/v1/chat/compile`.

### Request

```json
{
  "message": "画一个半径为3的圆",
  "mode": "byok",
  "model": "gpt-4o-mini",
  "attachments": [],
  "context": {
    "recentMessages": [
      { "role": "user", "content": "先创建点A和点B" }
    ],
    "sceneTransactions": [
      {
        "sceneId": "s1",
        "transactionId": "t1",
        "commandCount": 2
      }
    ]
  }
}
```

The body is validated against the `AgentRun` schema. Gateway uses the provided message, mode, attachments, and context to orchestrate the `author -> reviewer -> optional reviser -> preflight` workflow, returning the fully resolved `agent_run` payload.

### Response 200

```json
{
  "trace_id": "tr_123",
  "agent_run": {
    "run": {
      "status": "success",
      "scene_id": "s1",
      "transaction_id": "t1",
      "command_batch": {
        "version": "1.0",
        "commands": []
      }
    },
    "reviews": [
      {
        "name": "reviewer",
        "verdict": "ok"
      }
    ],
    "telemetry": {
      "agent_name": "geometry",
      "upstream_call_count": 1,
      "degraded": false
    }
  },
  "metadata": {
    "attachments": {
      "image": 0
    }
  }
}
```

#### Response Headers

- `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`
- `x-trace-id` mirrors the `trace_id` in the body when present

#### Errors

- `400`: `INVALID_REQUEST` when the payload fails schema validation or attachments are unsupported
- `401`: `MISSING_AUTH_HEADER` / `SESSION_EXPIRED` when official mode lacks/has an invalid session
- `429`: `RATE_LIMITED` when rate limits are exhausted
- `503`: `GATEWAY_BUSY` when the compile guard is saturated
- `504`: `COMPILE_TIMEOUT` when the guard times out
- `502`: `AGENT_WORKFLOW_FAILED` for upstream workflow failures

This endpoint is the canonical contract for AgentRun orchestration in GeoHelper. Clients should prefer `/api/v2/agent/runs` for all new compile traffic.

## POST /api/v1/chat/compile (legacy)

### Compatibility note

This route remains available only as a legacy shell. It calls into the same AgentRun workflow described above but should not be used for new development; `/api/v2/agent/runs` is now the primary compile contract and will eventually replace this endpoint.

### Headers

- Official mode: `Authorization: Bearer <session_token>`
- BYOK mode: optional `x-byok-endpoint`, `x-byok-key`
- Legacy client compatibility flags:
  - `x-client-strict-validation: 1`
  - `x-client-fallback-single-agent: 1`
  - `x-client-performance-sampling: 1`

### Request

```json
{
  "message": "画一个半径为3的圆",
  "mode": "byok",
  "model": "gpt-4o-mini",
  "context": {
    "recentMessages": [
      { "role": "user", "content": "先创建点A和点B" },
      { "role": "assistant", "content": "已创建点A和点B" }
    ],
    "sceneTransactions": [
      {
        "sceneId": "s1",
        "transactionId": "t1",
        "commandCount": 2
      }
    ]
  }
}
```

`context` is optional. It helps the gateway preserve conversational continuity and scene awareness.

### Response 200

```json
{
  "trace_id": "tr_123",
  "batch": {
    "version": "1.0",
    "scene_id": "s1",
    "transaction_id": "t1",
    "commands": [],
    "post_checks": [],
    "explanations": []
  },
  "agent_steps": [
    {
      "name": "intent",
      "status": "ok",
      "duration_ms": 18
    },
    {
      "name": "planner",
      "status": "ok",
      "duration_ms": 25
    },
    {
      "name": "command",
      "status": "ok",
      "duration_ms": 54
    },
    {
      "name": "verifier",
      "status": "ok",
      "duration_ms": 1
    },
    {
      "name": "repair",
      "status": "skipped",
      "duration_ms": 0
    }
  ]
}
```

### Response Headers (when `x-client-performance-sampling: 1`)

- `x-perf-total-ms`: end-to-end compile latency on gateway
- `x-perf-upstream-ms`: accumulated upstream model request latency

### Error 422

```json
{
  "error": {
    "code": "INVALID_COMMAND_BATCH",
    "message": "Command batch validation failed",
    "details": []
  }
}
```

### Error 429

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests"
  }
}
```

### Error 502

```json
{
  "error": {
    "code": "LITELLM_UPSTREAM_ERROR",
    "message": "Failed to compile with upstream model"
  }
}
```

## GET /admin/metrics

### Headers

- Optional: `x-admin-token: <ADMIN_METRICS_TOKEN>` when gateway config enables admin token protection.

### Response 200

```json
{
  "started_at": "2026-03-05T01:00:00.000Z",
  "compile": {
    "total_requests": 12,
    "success": 9,
    "failed": 2,
    "rate_limited": 1,
    "success_rate": 0.75,
    "rate_limited_ratio": 0.0833,
    "average_retry_count": 0.1111,
    "fallback_count": 2,
    "fallback_rate": 0.1818,
    "total_cost_usd": 0.364,
    "cost_per_request_usd": 0.030333,
    "p95_latency_ms": 812.5,
    "perf_sample_count": 3,
    "perf_total_ms_avg": 124.3333,
    "perf_upstream_ms_avg": 97.6667
  }
}
```

### Error 403

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin token is invalid"
  }
}
```

## GET /admin/compile-events

### Headers

- Optional: `x-admin-token: <ADMIN_METRICS_TOKEN>` when gateway config enables admin token protection.

### Query

- Optional: `limit` (default `20`, max `100`)
- Optional: `traceId`, `requestId`, `mode`, `finalStatus`, `since`

### Response 200

```json
{
  "events": [
    {
      "traceId": "tr_req-12",
      "requestId": "req-12",
      "event": "compile_success",
      "finalStatus": "fallback",
      "mode": "byok"
    }
  ]
}
```

## GET /admin/traces/:traceId

### Headers

- Optional: `x-admin-token: <ADMIN_METRICS_TOKEN>` when gateway config enables admin token protection.

### Response 200

```json
{
  "traceId": "tr_req-12",
  "requestId": "req-12",
  "finalStatus": "fallback",
  "mode": "byok",
  "events": [
    {
      "event": "compile_success",
      "traceId": "tr_req-12"
    },
    {
      "event": "compile_fallback",
      "traceId": "tr_req-12"
    }
  ]
}
```

### Error 404

```json
{
  "error": {
    "code": "TRACE_NOT_FOUND",
    "message": "Trace was not found"
  }
}
```
