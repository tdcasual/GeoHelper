# GeoHelper API Contract

GeoHelper 现已拆成两个活跃服务：

- Gateway: `http://<gateway-host>`
- Control plane: `http://<control-plane-host>`

`Content-Type: application/json`，除非接口明确说明是 SSE。

## Gateway

### GET /api/v1/health

```json
{
  "status": "ok",
  "time": "2026-04-04T00:00:00.000Z"
}
```

### GET /api/v1/ready

```json
{
  "ready": true,
  "dependencies": []
}
```

### POST /api/v1/auth/token/login

请求：

```json
{
  "token": "geo-allow",
  "device_id": "device-123"
}
```

响应：

```json
{
  "session_token": "<token>",
  "expires_in": 1800,
  "token_type": "Bearer"
}
```

### POST /api/v1/auth/token/revoke

请求头：

- `Authorization: Bearer <session_token>`

响应：

```json
{
  "revoked": true
}
```

### GET /admin/version

可选请求头：

- `x-admin-token: <ADMIN_METRICS_TOKEN>`

响应：

```json
{
  "git_sha": "abc123",
  "build_time": "2026-04-04T00:00:00.000Z",
  "node_env": "production",
  "redis_enabled": true,
  "attachments_enabled": false
}
```

### GET /admin/metrics

可选请求头：

- `x-admin-token: <ADMIN_METRICS_TOKEN>`

响应：

```json
{
  "started_at": "2026-04-04T00:00:00.000Z",
  "gateway": {
    "official_auth_enabled": true,
    "admin_token_enabled": true,
    "alert_webhook_enabled": false,
    "redis_enabled": true,
    "backup_storage": "redis",
    "session_revocation_storage": "redis",
    "attachments_enabled": false,
    "trace_header_name": "x-trace-id"
  }
}
```

### Backup Envelope

Gateway 仍负责单租户备份与恢复，备份信封格式如下：

```json
{
  "schema_version": 2,
  "created_at": "2026-04-04T00:00:00.000Z",
  "updated_at": "2026-04-04T00:00:00.000Z",
  "app_version": "0.0.1",
  "checksum": "abcd1234",
  "conversations": [],
  "settings": {
    "chat_snapshot": {},
    "settings_snapshot": {},
    "ui_preferences": {}
  }
}
```

活跃备份接口：

- `PUT /admin/backups/latest`
- `POST /admin/backups/guarded`
- `GET /admin/backups/latest`
- `GET /admin/backups/history`
- `GET /admin/backups/history/:snapshotId`
- `POST /admin/backups/history/:snapshotId/protect`
- `DELETE /admin/backups/history/:snapshotId/protect`
- `POST /admin/backups/compare`

## Control Plane

### GET /api/v3/health

```json
{
  "status": "ok",
  "service": "control-plane",
  "time": "2026-04-09T10:00:00.000Z"
}
```

### GET /api/v3/ready

```json
{
  "ready": true,
  "service": "control-plane",
  "time": "2026-04-09T10:00:00.000Z",
  "executionMode": "inline_worker_loop",
  "dependencies": [
    {
      "name": "agent_store",
      "status": "ok"
    },
    {
      "name": "runtime_registry",
      "status": "ok",
      "details": {
        "runProfileCount": 3,
        "agentCount": 2,
        "workflowCount": 2
      }
    }
  ]
}
```

### GET /api/v3/run-profiles

响应：

```json
{
  "runProfiles": [
    {
      "id": "platform_geometry_standard",
      "name": "几何解题",
      "description": "标准几何解题链路，保留完整的规划、工具和课堂就绪预算。",
      "agentId": "geometry_solver",
      "workflowId": "wf_geometry_solver",
      "defaultBudget": {
        "maxModelCalls": 6,
        "maxToolCalls": 8,
        "maxDurationMs": 120000
      }
    }
  ]
}
```

### POST /api/v3/threads

请求：

```json
{
  "title": "Triangle lesson"
}
```

响应：

```json
{
  "thread": {
    "id": "thread_1",
    "title": "Triangle lesson",
    "createdAt": "2026-04-04T00:00:00.000Z"
  }
}
```

### POST /api/v3/threads/:threadId/runs

请求：

```json
{
  "profileId": "platform_geometry_standard",
  "inputArtifactIds": []
}
```

响应：

```json
{
  "run": {
    "id": "run_1",
    "threadId": "thread_1",
    "workflowId": "wf_geometry_solver",
    "agentId": "geometry_solver",
    "status": "queued",
    "inputArtifactIds": [],
    "outputArtifactIds": [],
    "budget": {
      "maxModelCalls": 6,
      "maxToolCalls": 8,
      "maxDurationMs": 120000
    },
    "createdAt": "2026-04-04T00:00:00.000Z",
    "updatedAt": "2026-04-04T00:00:00.000Z"
  }
}
```

### GET /api/v3/runs/:runId/stream

返回 `text/event-stream`。当前服务会发送一条 `run.snapshot` 事件：

```text
event: run.snapshot
data: {"run":{"id":"run_1","status":"queued"},"events":[],"checkpoints":[],"artifacts":[],"memoryEntries":[]}
```

`RunSnapshot` 的活跃字段：

- `run`: 当前 run 元信息
- `events`: 事件序列
- `checkpoints`: 待人工或工具处理的 checkpoint
- `artifacts`: draft / response / tool_result / canvas_evidence 等产物
- `memoryEntries`: run 产生的记忆写入

### POST /api/v3/checkpoints/:checkpointId/resolve

请求：

```json
{
  "response": {
    "approved": true
  }
}
```

响应：

```json
{
  "checkpoint": {
    "id": "checkpoint_1",
    "runId": "run_1",
    "status": "resolved"
  }
}
```

### POST /api/v3/browser-sessions

```json
{
  "runId": "run_1",
  "allowedToolNames": ["scene.read_state", "scene.apply_command_batch"]
}
```

### POST /api/v3/browser-sessions/:sessionId/tool-results

```json
{
  "runId": "run_1",
  "toolName": "scene.apply_command_batch",
  "status": "completed",
  "output": {
    "commandCount": 1
  }
}
```

## Control Plane Admin

活跃 admin 接口：

- `GET /admin/runs`
- `GET /admin/runs/:runId/timeline`
- `GET /admin/checkpoints`
- `GET /admin/memory/writes`
- `GET /admin/tools/usage`

这些接口用于 run 列表、timeline、checkpoint inbox、memory 写入与工具使用可视化。

## Removed Surface

以下旧接口不再属于活跃主线：

- `POST /api/v1/chat/compile`
- 旧的 v2 agent run 入口
- `/admin/compile-events`
- `/admin/traces/:traceId`
