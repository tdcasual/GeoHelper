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

## POST /api/v1/chat/compile

### Headers

- Official mode: `Authorization: Bearer <session_token>`
- BYOK mode: optional `x-byok-endpoint`, `x-byok-key`

### Request

```json
{
  "message": "画一个半径为3的圆",
  "mode": "byok",
  "model": "gpt-4o-mini"
}
```

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
