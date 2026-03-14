# Plans Index

This directory stores dated design and implementation documents.

## Topic Navigation

Use this section when you know the problem domain first and only then want the right design/plan documents.

### Runtime

- App baseline: [`2026-03-04-geogebra-llm-app-design.md`](./2026-03-04-geogebra-llm-app-design.md), [`2026-03-04-geogebra-llm-m0-m1-implementation-plan.md`](./2026-03-04-geogebra-llm-m0-m1-implementation-plan.md)
- Dual runtime model: [`2026-03-05-dual-runtime-architecture-design.md`](./2026-03-05-dual-runtime-architecture-design.md)
- Composer vision + settings runtime flow: [`2026-03-06-composer-vision-settings-center-design.md`](./2026-03-06-composer-vision-settings-center-design.md), [`2026-03-06-composer-vision-settings-implementation-plan.md`](./2026-03-06-composer-vision-settings-implementation-plan.md)
- Scene rehydrate and live backup sync: [`2026-03-07-scene-rehydrate-backup-sync-implementation-plan.md`](./2026-03-07-scene-rehydrate-backup-sync-implementation-plan.md)

### UI

- Chat redesign: [`2026-03-05-chat-ui-redesign-design.md`](./2026-03-05-chat-ui-redesign-design.md), [`2026-03-05-chat-ui-redesign-implementation-plan.md`](./2026-03-05-chat-ui-redesign-implementation-plan.md)
- Settings center: [`2026-03-05-settings-center-design.md`](./2026-03-05-settings-center-design.md)
- Desktop empty state: [`2026-03-07-desktop-empty-state-design.md`](./2026-03-07-desktop-empty-state-design.md), [`2026-03-07-desktop-empty-state-implementation-plan.md`](./2026-03-07-desktop-empty-state-implementation-plan.md)
- Ultrawide settings drawer: [`2026-03-07-ultrawide-settings-drawer-design.md`](./2026-03-07-ultrawide-settings-drawer-design.md), [`2026-03-07-ultrawide-settings-drawer-implementation-plan.md`](./2026-03-07-ultrawide-settings-drawer-implementation-plan.md)

### Responsive

- Breakpoint stabilization: [`2026-03-07-responsive-breakpoint-stabilization-design.md`](./2026-03-07-responsive-breakpoint-stabilization-design.md), [`2026-03-07-responsive-breakpoint-stabilization-implementation-plan.md`](./2026-03-07-responsive-breakpoint-stabilization-implementation-plan.md)
- Short-landscape density: [`2026-03-07-short-landscape-chat-density-design.md`](./2026-03-07-short-landscape-chat-density-design.md), [`2026-03-07-short-landscape-chat-density-implementation-plan.md`](./2026-03-07-short-landscape-chat-density-implementation-plan.md)
- Mobile/short-height polish: [`2026-03-08-mobile-empty-settings-polish-implementation-plan.md`](./2026-03-08-mobile-empty-settings-polish-implementation-plan.md)
- Responsive polish series: [`2026-03-08-responsive-polish-p0-p2-implementation-plan.md`](./2026-03-08-responsive-polish-p0-p2-implementation-plan.md), [`2026-03-08-responsive-overflow-round9-implementation-plan.md`](./2026-03-08-responsive-overflow-round9-implementation-plan.md), [`2026-03-08-short-landscape-overlay-menus-implementation-plan.md`](./2026-03-08-short-landscape-overlay-menus-implementation-plan.md)

### Backup

- Backup and restore runtime behavior: [`2026-03-07-scene-rehydrate-backup-sync-implementation-plan.md`](./2026-03-07-scene-rehydrate-backup-sync-implementation-plan.md)
- Remote backup/ops closure on backend: [`2026-03-11-backend-v4-automation-backup-roadmap.md`](./2026-03-11-backend-v4-automation-backup-roadmap.md), [`2026-03-12-backend-v5-ops-closure-roadmap.md`](./2026-03-12-backend-v5-ops-closure-roadmap.md), [`2026-03-12-backend-v7a-lightweight-cloud-sync-roadmap.md`](./2026-03-12-backend-v7a-lightweight-cloud-sync-roadmap.md), [`2026-03-12-backend-v7c-snapshot-history-resolution-roadmap.md`](./2026-03-12-backend-v7c-snapshot-history-resolution-roadmap.md), [`2026-03-13-backend-v7d-protected-history-retention-roadmap.md`](./2026-03-13-backend-v7d-protected-history-retention-roadmap.md), [`2026-03-13-backend-v7e-selected-history-preflight-roadmap.md`](./2026-03-13-backend-v7e-selected-history-preflight-roadmap.md), [`2026-03-14-backend-v7f-history-relation-badges-roadmap.md`](./2026-03-14-backend-v7f-history-relation-badges-roadmap.md), [`2026-03-14-backend-v7g-pulled-preview-import-guidance-roadmap.md`](./2026-03-14-backend-v7g-pulled-preview-import-guidance-roadmap.md), [`2026-03-14-backend-v7h-selected-history-pull-stale-guard-roadmap.md`](./2026-03-14-backend-v7h-selected-history-pull-stale-guard-roadmap.md)
- Runtime docs: [`../user/settings-backup-recovery.md`](../user/settings-backup-recovery.md), [`../BETA_CHECKLIST.md`](../BETA_CHECKLIST.md)

### Backend

- Gateway hardening baseline: [`2026-03-10-backend-gateway-hardening-implementation-plan.md`](./2026-03-10-backend-gateway-hardening-implementation-plan.md)
- Roadmap sequence: [`2026-03-11-backend-v2-roadmap.md`](./2026-03-11-backend-v2-roadmap.md), [`2026-03-11-backend-v3-operability-roadmap.md`](./2026-03-11-backend-v3-operability-roadmap.md), [`2026-03-11-backend-v4-automation-backup-roadmap.md`](./2026-03-11-backend-v4-automation-backup-roadmap.md), [`2026-03-12-backend-v5-ops-closure-roadmap.md`](./2026-03-12-backend-v5-ops-closure-roadmap.md), [`2026-03-12-backend-v6-vision-attachments-roadmap.md`](./2026-03-12-backend-v6-vision-attachments-roadmap.md)

## Backend Roadmap Timeline

The backend roadmap sequence currently spans `V2` through `V7-H`. Read them in order when you want the architecture story behind the current self-hosted gateway.

| Version | Date | Theme | Plan | Status |
| --- | --- | --- | --- | --- |
| `V2` | 2026-03-11 | Gateway hardening and self-hosted control-plane basics | [`2026-03-11-backend-v2-roadmap.md`](./2026-03-11-backend-v2-roadmap.md) | Completed |
| `V3` | 2026-03-11 | Durable operability, traceability, and runtime protection | [`2026-03-11-backend-v3-operability-roadmap.md`](./2026-03-11-backend-v3-operability-roadmap.md) | Completed |
| `V4` | 2026-03-11 | Operator automation, evidence artifacts, and gateway backup flows | [`2026-03-11-backend-v4-automation-backup-roadmap.md`](./2026-03-11-backend-v4-automation-backup-roadmap.md) | Completed |
| `V5` | 2026-03-12 | Ops closure, scheduled verification, published evidence, and remote recovery | [`2026-03-12-backend-v5-ops-closure-roadmap.md`](./2026-03-12-backend-v5-ops-closure-roadmap.md) | Completed / historical context |
| `V6` | 2026-03-12 | Gateway vision capability and image attachment support | [`2026-03-12-backend-v6-vision-attachments-roadmap.md`](./2026-03-12-backend-v6-vision-attachments-roadmap.md) | Completed / historical context |
| `V7-A` | 2026-03-12 | Local-first lightweight cloud sync via remote snapshots | [`2026-03-12-backend-v7a-lightweight-cloud-sync-roadmap.md`](./2026-03-12-backend-v7a-lightweight-cloud-sync-roadmap.md) | Completed / historical context |
| `V7-B` | 2026-03-12 | Guarded lightweight sync writes and conflict resolution | [`2026-03-12-backend-v7b-guarded-lightweight-sync-roadmap.md`](./2026-03-12-backend-v7b-guarded-lightweight-sync-roadmap.md) | Completed / historical context |
| `V7-C` | 2026-03-12 | Explicit snapshot history browsing and selected-snapshot recovery | [`2026-03-12-backend-v7c-snapshot-history-resolution-roadmap.md`](./2026-03-12-backend-v7c-snapshot-history-resolution-roadmap.md) | Completed / historical context |
| `V7-D` | 2026-03-13 | Protected remote snapshots and explicit retention policy | [`2026-03-13-backend-v7d-protected-history-retention-roadmap.md`](./2026-03-13-backend-v7d-protected-history-retention-roadmap.md) | Completed / historical context |
| `V7-E` | 2026-03-13 | Selected retained snapshot preflight comparison before pull/import | [`2026-03-13-backend-v7e-selected-history-preflight-roadmap.md`](./2026-03-13-backend-v7e-selected-history-preflight-roadmap.md) | Completed / historical context |
| `V7-F` | 2026-03-14 | Compact local-relation badges across retained snapshot history list | [`2026-03-14-backend-v7f-history-relation-badges-roadmap.md`](./2026-03-14-backend-v7f-history-relation-badges-roadmap.md) | Completed / historical context |
| `V7-G` | 2026-03-14 | Pulled snapshot preview source and import guidance before merge/replace | [`2026-03-14-backend-v7g-pulled-preview-import-guidance-roadmap.md`](./2026-03-14-backend-v7g-pulled-preview-import-guidance-roadmap.md) | Completed / historical context |
| `V7-H` | 2026-03-14 | Guard stale historical pull previews after selected snapshot changes | [`2026-03-14-backend-v7h-selected-history-pull-stale-guard-roadmap.md`](./2026-03-14-backend-v7h-selected-history-pull-stale-guard-roadmap.md) | Proposed / current latest roadmap |

## Frontend & Product Timeline

The frontend documents split naturally into two layers:

- product/runtime foundations that explain why the app is structured the way it is
- iterative UI and responsive stabilization plans that refine the shipped experience across desktop, tablet, mobile, and short-height layouts

### Product & Runtime Foundation

| Theme | Date | Design | Implementation | Status |
| --- | --- | --- | --- | --- |
| GeoHelper app baseline | 2026-03-04 | [`2026-03-04-geogebra-llm-app-design.md`](./2026-03-04-geogebra-llm-app-design.md) | [`2026-03-04-geogebra-llm-m0-m1-implementation-plan.md`](./2026-03-04-geogebra-llm-m0-m1-implementation-plan.md) | Baseline delivered |
| Dual runtime architecture | 2026-03-05 | [`2026-03-05-dual-runtime-architecture-design.md`](./2026-03-05-dual-runtime-architecture-design.md) | — | Implemented in V1 baseline |
| Settings center foundation | 2026-03-05 | [`2026-03-05-settings-center-design.md`](./2026-03-05-settings-center-design.md) | — | Validated + implemented via later UI work |
| Composer vision + settings refresh | 2026-03-06 | [`2026-03-06-composer-vision-settings-center-design.md`](./2026-03-06-composer-vision-settings-center-design.md) | [`2026-03-06-composer-vision-settings-implementation-plan.md`](./2026-03-06-composer-vision-settings-implementation-plan.md) | Completed |
| GeoGebra self-hosted latest vendor flow | 2026-03-06 | [`2026-03-06-geogebra-self-hosted-latest-design.md`](./2026-03-06-geogebra-self-hosted-latest-design.md) | [`2026-03-06-geogebra-self-hosted-latest-implementation-plan.md`](./2026-03-06-geogebra-self-hosted-latest-implementation-plan.md) | Completed |
| Scene rehydrate + backup sync | 2026-03-07 | — | [`2026-03-07-scene-rehydrate-backup-sync-implementation-plan.md`](./2026-03-07-scene-rehydrate-backup-sync-implementation-plan.md) | Completed |

### UI & Responsive Stabilization

| Theme | Date | Design | Implementation | Status |
| --- | --- | --- | --- | --- |
| Chat UI redesign | 2026-03-05 | [`2026-03-05-chat-ui-redesign-design.md`](./2026-03-05-chat-ui-redesign-design.md) | [`2026-03-05-chat-ui-redesign-implementation-plan.md`](./2026-03-05-chat-ui-redesign-implementation-plan.md) | Completed |
| UI stabilization baseline | 2026-03-06 | — | [`2026-03-06-ui-stabilization-implementation-plan.md`](./2026-03-06-ui-stabilization-implementation-plan.md) | Completed |
| Desktop empty state | 2026-03-07 | [`2026-03-07-desktop-empty-state-design.md`](./2026-03-07-desktop-empty-state-design.md) | [`2026-03-07-desktop-empty-state-implementation-plan.md`](./2026-03-07-desktop-empty-state-implementation-plan.md) | Completed |
| Responsive breakpoint stabilization | 2026-03-07 | [`2026-03-07-responsive-breakpoint-stabilization-design.md`](./2026-03-07-responsive-breakpoint-stabilization-design.md) | [`2026-03-07-responsive-breakpoint-stabilization-implementation-plan.md`](./2026-03-07-responsive-breakpoint-stabilization-implementation-plan.md) | Completed |
| Short-landscape chat density | 2026-03-07 | [`2026-03-07-short-landscape-chat-density-design.md`](./2026-03-07-short-landscape-chat-density-design.md) | [`2026-03-07-short-landscape-chat-density-implementation-plan.md`](./2026-03-07-short-landscape-chat-density-implementation-plan.md) | Completed |
| Ultrawide settings drawer | 2026-03-07 | [`2026-03-07-ultrawide-settings-drawer-design.md`](./2026-03-07-ultrawide-settings-drawer-design.md) | [`2026-03-07-ultrawide-settings-drawer-implementation-plan.md`](./2026-03-07-ultrawide-settings-drawer-implementation-plan.md) | Completed |
| Mobile empty state + short settings polish | 2026-03-08 | — | [`2026-03-08-mobile-empty-settings-polish-implementation-plan.md`](./2026-03-08-mobile-empty-settings-polish-implementation-plan.md) | Completed |
| Responsive polish P0-P2 | 2026-03-08 | — | [`2026-03-08-responsive-polish-p0-p2-implementation-plan.md`](./2026-03-08-responsive-polish-p0-p2-implementation-plan.md) | Completed |
| Responsive overflow round 9 | 2026-03-08 | — | [`2026-03-08-responsive-overflow-round9-implementation-plan.md`](./2026-03-08-responsive-overflow-round9-implementation-plan.md) | Completed |
| Short-landscape overlay menus | 2026-03-08 | — | [`2026-03-08-short-landscape-overlay-menus-implementation-plan.md`](./2026-03-08-short-landscape-overlay-menus-implementation-plan.md) | Completed |

## Suggested Reading Order

### Backend

1. Start with [`2026-03-11-backend-v2-roadmap.md`](./2026-03-11-backend-v2-roadmap.md).
2. Continue through [`2026-03-11-backend-v3-operability-roadmap.md`](./2026-03-11-backend-v3-operability-roadmap.md) and [`2026-03-11-backend-v4-automation-backup-roadmap.md`](./2026-03-11-backend-v4-automation-backup-roadmap.md).
3. Read [`2026-03-12-backend-v5-ops-closure-roadmap.md`](./2026-03-12-backend-v5-ops-closure-roadmap.md) for the ops-closure layer.
4. Continue with [`2026-03-12-backend-v6-vision-attachments-roadmap.md`](./2026-03-12-backend-v6-vision-attachments-roadmap.md) for the current gateway vision/attachment layer.
5. Read [`2026-03-12-backend-v7a-lightweight-cloud-sync-roadmap.md`](./2026-03-12-backend-v7a-lightweight-cloud-sync-roadmap.md) for the baseline lightweight cloud sync layer.
6. Read [`2026-03-12-backend-v7b-guarded-lightweight-sync-roadmap.md`](./2026-03-12-backend-v7b-guarded-lightweight-sync-roadmap.md) for conflict-safe uploads without adding SQL.
7. Read [`2026-03-12-backend-v7c-snapshot-history-resolution-roadmap.md`](./2026-03-12-backend-v7c-snapshot-history-resolution-roadmap.md) for the Route 1 snapshot-history layer: explicit history browsing and selected-snapshot recovery without adding SQL.
8. Read [`2026-03-13-backend-v7d-protected-history-retention-roadmap.md`](./2026-03-13-backend-v7d-protected-history-retention-roadmap.md) for the retention layer: protected recovery anchors plus separate ordinary/protected snapshot limits.
9. Read [`2026-03-13-backend-v7e-selected-history-preflight-roadmap.md`](./2026-03-13-backend-v7e-selected-history-preflight-roadmap.md) for the selected-snapshot recovery guidance layer: selected retained snapshot relation versus the current local snapshot before pull/import.
10. Read [`2026-03-14-backend-v7f-history-relation-badges-roadmap.md`](./2026-03-14-backend-v7f-history-relation-badges-roadmap.md) for the list-scanning guidance layer: compact local-relation badges across retained snapshot history.
11. Read [`2026-03-14-backend-v7g-pulled-preview-import-guidance-roadmap.md`](./2026-03-14-backend-v7g-pulled-preview-import-guidance-roadmap.md) for the pulled-preview import-decision guidance layer.
12. Read [`2026-03-14-backend-v7h-selected-history-pull-stale-guard-roadmap.md`](./2026-03-14-backend-v7h-selected-history-pull-stale-guard-roadmap.md) for the latest selected-history stale-preview safety layer.

### Frontend

1. Start with the product baseline: [`2026-03-04-geogebra-llm-app-design.md`](./2026-03-04-geogebra-llm-app-design.md) and [`2026-03-04-geogebra-llm-m0-m1-implementation-plan.md`](./2026-03-04-geogebra-llm-m0-m1-implementation-plan.md).
2. Read [`2026-03-05-dual-runtime-architecture-design.md`](./2026-03-05-dual-runtime-architecture-design.md) for runtime mode context.
3. Read the settings/composer path: [`2026-03-05-settings-center-design.md`](./2026-03-05-settings-center-design.md), [`2026-03-06-composer-vision-settings-center-design.md`](./2026-03-06-composer-vision-settings-center-design.md), and [`2026-03-06-composer-vision-settings-implementation-plan.md`](./2026-03-06-composer-vision-settings-implementation-plan.md).
4. Read [`2026-03-06-geogebra-self-hosted-latest-design.md`](./2026-03-06-geogebra-self-hosted-latest-design.md) and [`2026-03-06-geogebra-self-hosted-latest-implementation-plan.md`](./2026-03-06-geogebra-self-hosted-latest-implementation-plan.md) for vendor-sync/self-hosting history.
5. Read the chat and responsive series in order: [`2026-03-05-chat-ui-redesign-design.md`](./2026-03-05-chat-ui-redesign-design.md), [`2026-03-05-chat-ui-redesign-implementation-plan.md`](./2026-03-05-chat-ui-redesign-implementation-plan.md), then the 2026-03-06 to 2026-03-08 stabilization plans.
6. Finish with [`2026-03-07-scene-rehydrate-backup-sync-implementation-plan.md`](./2026-03-07-scene-rehydrate-backup-sync-implementation-plan.md) when debugging restore, hydration, or in-place backup import behavior.

## Related Runtime Docs

- Deploy runbook: [`../deploy/edgeone.md`](../deploy/edgeone.md)
- Release checklist: [`../BETA_CHECKLIST.md`](../BETA_CHECKLIST.md)
- Backup and recovery guide: [`../user/settings-backup-recovery.md`](../user/settings-backup-recovery.md)
