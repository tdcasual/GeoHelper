# Plans Index

This directory stores dated design and implementation documents.

## Backend Roadmap Timeline

The backend roadmap sequence currently spans `V2` through `V6`. Read them in order when you want the architecture story behind the current self-hosted gateway.

| Version | Date | Theme | Plan | Status |
| --- | --- | --- | --- | --- |
| `V2` | 2026-03-11 | Gateway hardening and self-hosted control-plane basics | [`2026-03-11-backend-v2-roadmap.md`](./2026-03-11-backend-v2-roadmap.md) | Completed |
| `V3` | 2026-03-11 | Durable operability, traceability, and runtime protection | [`2026-03-11-backend-v3-operability-roadmap.md`](./2026-03-11-backend-v3-operability-roadmap.md) | Completed |
| `V4` | 2026-03-11 | Operator automation, evidence artifacts, and gateway backup flows | [`2026-03-11-backend-v4-automation-backup-roadmap.md`](./2026-03-11-backend-v4-automation-backup-roadmap.md) | Completed |
| `V5` | 2026-03-12 | Ops closure, scheduled verification, published evidence, and remote recovery | [`2026-03-12-backend-v5-ops-closure-roadmap.md`](./2026-03-12-backend-v5-ops-closure-roadmap.md) | Completed / historical context |
| `V6` | 2026-03-12 | Gateway vision capability and image attachment support | [`2026-03-12-backend-v6-vision-attachments-roadmap.md`](./2026-03-12-backend-v6-vision-attachments-roadmap.md) | Completed / current latest roadmap |

## What Each Version Added

### `V2` Foundation

- Hardened the gateway into a more reliable self-hosted control plane.
- Established readiness, operator visibility, smoke tooling, and deployability as first-class concerns.
- Serves as the baseline for all later backend roadmap work.

### `V3` Operability

- Added durable operator workflows such as retained compile events, trace drill-down, version identity, and bounded runtime protection.
- Shifted the release process from ad-hoc smoke checks toward richer operator evidence.
- Tightened failure diagnosis without expanding product scope.

### `V4` Automation & Backup

- Added `ops:gateway:verify`, persistent verification artifacts, threshold evaluation, and single-tenant backup flows.
- Introduced gateway-side latest-backup admin routes and web-side remote backup integration.
- Made the backend meaningfully more self-service for personal self-hosted teaching use.

### `V5` Ops Closure & Recovery

- Closed the loop around recurring verification by adding the scheduled ops wrapper, artifact publishing, webhook summaries, and restore drills.
- Unified backup validation through `@geohelper/protocol` so browser, gateway, and CLI tooling share the same envelope contract.
- Added explicit encrypted remote-backup admin-token handling and manual recovery actions in the web settings flow.

### `V6` Vision & Attachments

- Extended the gateway from text-only compile orchestration into capability-gated multimodal request handling.
- Added a shared image attachment protocol, runtime capability discovery, gateway image forwarding, and vision-specific smoke/release gates.
- Kept direct runtime and gateway runtime differences explicit so self-hosted deployments can enable vision intentionally.

## Suggested Reading Order

1. Start with [`2026-03-11-backend-v2-roadmap.md`](./2026-03-11-backend-v2-roadmap.md).
2. Continue through [`2026-03-11-backend-v3-operability-roadmap.md`](./2026-03-11-backend-v3-operability-roadmap.md) and [`2026-03-11-backend-v4-automation-backup-roadmap.md`](./2026-03-11-backend-v4-automation-backup-roadmap.md).
3. Read [`2026-03-12-backend-v5-ops-closure-roadmap.md`](./2026-03-12-backend-v5-ops-closure-roadmap.md) for the ops-closure layer.
4. Finish with [`2026-03-12-backend-v6-vision-attachments-roadmap.md`](./2026-03-12-backend-v6-vision-attachments-roadmap.md) for the current gateway vision/attachment layer.

## Related Runtime Docs

- Deploy runbook: [`../deploy/edgeone.md`](../deploy/edgeone.md)
- Release checklist: [`../BETA_CHECKLIST.md`](../BETA_CHECKLIST.md)
- Backup and recovery guide: [`../user/settings-backup-recovery.md`](../user/settings-backup-recovery.md)
