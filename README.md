# GeoHelper

GeoHelper 正在从几何 compile 流水线重构为平台型 agent 系统。当前主线由静态前端、网关运维面、`/api/v3` control plane、worker 运行时，以及一组 `agent-*` 平台包组成。

## Monorepo Structure

- `apps/web`: React + Vite 前端，消费 thread/run/checkpoint/artifact 状态
- `apps/gateway`: Fastify 网关，负责 health、Official token、备份、版本与运维接口
- `apps/control-plane`: 平台 API，负责 thread、run、checkpoint、stream 与 admin 视图
- `apps/worker`: 平台 worker 运行时
- `packages/agent-*`: 平台协议、存储、工作流引擎、工具、记忆与几何领域包
- `packages/protocol`: GeoGebra 命令与前端共享协议

## Quick Start

```bash
pnpm install
pnpm --filter @geohelper/gateway dev
pnpm --filter @geohelper/control-plane dev
pnpm --filter @geohelper/worker dev
pnpm geogebra:sync
pnpm --filter @geohelper/web dev
```

- Web: `http://localhost:5173`
- Gateway: `http://localhost:8787`
- Control plane: `http://localhost:4310`
- GeoGebra 资源位于 `apps/web/public/vendor/geogebra/current/`

## Runtime Surface

- Gateway 负责 `/api/v1/health`、`/api/v1/ready`、`/api/v1/auth/token/*`、`/admin/backups/*`、`/admin/version` 与 `/admin/metrics`
- Control plane 负责 `/api/v3/threads`、`/api/v3/threads/:threadId/runs`、`/api/v3/runs/:runId/stream`、`/api/v3/checkpoints/:checkpointId/resolve`
- 旧的 v2 agent run 入口已从主线架构中移除

完整接口说明见 [docs/api/m0-m1-contract.md](docs/api/m0-m1-contract.md)。

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm verify:architecture
```

常用专项脚本：

```bash
pnpm smoke:gateway-runtime -- --dry-run
pnpm smoke:live-model
pnpm bench:quality -- --dry-run
```

## Deploy Notes

- Gateway 镜像仍通过 `pnpm docker:gateway:build` 构建
- GitHub Actions auto-publishes the gateway image to GHCR after successful `main` CI
- gateway runtime deployment remains manual even when image publishing is automated
- `VITE_GATEWAY_URL` 仍用于当前前端的网关侧登录与备份配置
- 控制面与 worker 需要和前端一起部署，才能形成完整的平台 run 链路

更多资料：

- [docs/BETA_CHECKLIST.md](docs/BETA_CHECKLIST.md)
- [docs/plans/README.md](docs/plans/README.md)
- [docs/deploy/edgeone.md](docs/deploy/edgeone.md)
- [docs/user/settings-backup-recovery.md](docs/user/settings-backup-recovery.md)
