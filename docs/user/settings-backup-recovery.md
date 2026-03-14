# Settings Backup & Recovery Guide

This guide covers export/import operations in the web settings center and how to recover from common failures.

## Scope

- Entry point: top-right `设置` drawer, section `备份与恢复`.
- Backup file name: `geochat-backup.json`.
- Current app schema baseline: `schema_version = 1`.

## Export Backup

1. Open `设置`.
2. Go to `备份与恢复`.
3. Click `导出备份`.
4. The browser downloads `geochat-backup.json`.

Export includes:

- chat snapshot (`geohelper.chat.snapshot`)
- settings snapshot (`geohelper.settings.snapshot`)
- UI preferences (`geohelper.ui.preferences`)

## Import Backup

1. Open `设置` -> `备份与恢复`.
2. Click `导入备份` and choose a JSON file.
3. Review import preview:
   - schema version
   - created time
   - source app version
   - conversation count
   - migration hint (`compatible`, `older`, `newer`)
4. Choose one strategy:
   - `合并导入（推荐）`
   - `覆盖导入`
5. If you choose `覆盖导入`, the first click only arms the destructive action; click the warning-state button `确认覆盖本地数据` to actually replace local data.
6. Before any manual import runs, GeoHelper captures one browser-local `导入前恢复锚点`, so you can restore the pre-import local snapshot later if needed.
7. After a successful manual import, the same card now also shows:
   - `导入后本地快照`
   - `本次导入结果`
   - whether current local conversations still match that imported result, or have already changed again

### Strategy Differences

- `合并导入（推荐）`
  - Conversation conflict key: `conversation.id`.
  - Conflict winner: larger `updatedAt`.
  - Preset conflict key: `preset.id`.
  - Conflict winner: larger `updatedAt`.
  - UI preferences: incoming fields override same-key local fields.
- `覆盖导入`
  - Replace local snapshots with imported snapshots.
  - Requires explicit second-click confirmation in the preview panel before the overwrite runs.
- `导入前恢复锚点`
  - Captured automatically before every manual import into local browser state.
  - Stored only in the current browser profile.
  - Holds one latest pre-import snapshot, not a multi-version history.
  - After import success, the same card records one post-import result summary for comparison.

## Migration Hints

- `compatible`: imported schema equals current schema.
- `older`: imported schema is lower than current schema; app applies best-effort compatibility import.
- `newer`: imported schema is higher than current schema; import is still allowed, but unknown future fields may be ignored.

## Remote Recovery Drill

For personal self-hosted deployments, `设置` -> `数据与安全` -> `网关远端备份` now exposes 轻量云同步. This remains snapshot-based recovery/sync, not message-by-message live sync, and 不是完整云端聊天历史. The gateway keeps retained remote snapshot history for explicit inspection/recovery; users can fetch one selected historical snapshot by `snapshot_id` when needed.

### Protected Retention Policy

- 普通保留历史 and 受保护快照 are separate bounded classes.
- `BACKUP_MAX_HISTORY` controls ordinary retained history.
- `BACKUP_MAX_PROTECTED` controls retained protected snapshots.
- protected snapshots do not auto-expire.
- new protect requests fail explicitly when protected capacity is full.
- `保护此快照` / `取消保护` is a 手动元数据操作 and 不代表立即导入或恢复.

For personal self-hosted deployments that enable gateway backup sync, operators can verify the latest remote backup without importing it into the browser.

Dry-run the operator checklist:

```bash
pnpm smoke:gateway-backup-restore -- --dry-run
```

Inspect the latest remote backup metadata from the gateway:

```bash
GATEWAY_URL=https://<gateway-domain> \
ADMIN_METRICS_TOKEN=<admin-token> \
pnpm smoke:gateway-backup-restore
```

The drill validates the downloaded `backup.envelope` with the shared protocol checksum logic and reports: `stored_at`, `schema_version`, `created_at`, `app_version`, and `conversation_count`. It does not write to browser storage or trigger an import.

Remote backup capability and runtime image capability are separate concerns: saving a gateway admin token or enabling remote restore does not imply gateway image attachments are enabled. In mixed deployments, direct runtime and gateway runtime can legitimately differ in vision support.

When the web app stores a gateway backup admin token, it is encrypted separately from BYOK keys and persisted inside the local settings snapshot as ciphertext only. After moving backups across browser profiles or clearing local secure keys, you may need to re-enter the remote admin token before upload/download actions work again.

### Lightweight Cloud Sync Modes

- `关闭`: no startup check and no delayed upload.
- `仅提醒（启动检查）`: startup freshness check only. 启动检查只拉取元数据，不会下载完整快照。
- `延迟上传`: after local snapshot writes, the browser can upload the latest snapshot on a delay, but it still does not pull remote data automatically.

In `设置` -> `数据与安全` -> `网关远端备份`, the workflow is explicit and manual:

1. Save the gateway admin token.
2. Choose `关闭` / `仅提醒（启动检查）` / `延迟上传` based on how proactive you want remote snapshot handling to be.
3. Click `检查云端状态` to compare local and remote freshness without downloading a full backup. This also surfaces retained remote snapshot history in the settings UI.
4. Review the retained history list, distinguish 普通保留历史 from 受保护快照, use each list item’s compact relation badge (`内容一致` / `本地较新` / `云端较新` / `已分叉`) for quick triage, then select the target snapshot and note its `snapshot_id`, `device_id`, `updated_at`, conversation count, and the detailed preflight relation versus the current local snapshot before recovery.
5. If this is a recovery anchor you do not want pruned by later routine uploads, click `保护此快照`; if it is no longer special, click `取消保护`.
6. Click `拉取最新快照` when you want the latest remote snapshot, or click `拉取所选历史快照` when you want one explicitly selected historical snapshot.
7. After pull completes, read the preview panel’s `拉取来源`、`与本地关系`、`导入建议`、`当前导入对象`, and the conversation-level `导入影响预估（按会话）`, then choose `拉取后导入（合并）` or `拉取后覆盖导入` based on recovery intent.
8. If you choose `拉取后覆盖导入`, the first click only arms the dangerous action; click `确认拉取后覆盖导入` to actually replace local data with the pulled snapshot.
9. If you switch the selected historical snapshot after pulling one history item, the previous pulled preview becomes stale: the UI will block import and ask you to re-pull the newly selected snapshot first.
10. After any successful manual import, use the `导入前恢复锚点` card in the same section to review:
    - `导入前本地快照`
    - `导入后本地快照`
    - `本次导入结果`
    - whether current local conversations have already changed again after that import
11. If the card warns that current local content has changed again after import, `恢复到导入前状态` will also discard those newer post-import local changes.
12. You can still choose `恢复到导入前状态` or `清除此恢复锚点` explicitly.

默认浏览器路径现在使用 guarded 写入：

- `上传最新快照` 默认上传不会自动覆盖较新的云端快照。
- 当 compare 已显示 `云端较新` / `存在分叉`，或 guarded 写入返回冲突时，界面会要求你先检查保留历史并确认风险。
- 只有显式危险操作才会覆盖云端：你需要看到并点击 `仍然覆盖云端快照`。
- 阻塞/冲突状态的建议路径是：先看保留历史列表上的紧凑关系徽标、再看“所选快照与本地关系”的详细预检提示、必要时先保护当前选中的快照、再拉取所选快照预览、最后决定是否导入或覆盖云端。
- 网关的 `/admin/backups/latest` 仍然保留给 operator/manual recovery 使用，但浏览器侧同步默认先走 guarded 写入。

The UI does not background-sync full history, poll continuously, or auto-restore. 启动检查只拉取元数据；延迟上传也不会自动拉取或自动导入。 保留历史列表上的紧凑关系徽标、所选历史快照的“与本地关系”预检、拉取完成后的来源/导入建议、stale pulled-preview guard、按会话的导入影响预估、危险覆盖前的二次确认、以及导入前恢复锚点 / 导入结果摘要都只是只读或防错/回退辅助，不会自动拉取、自动导入或自动改写同步状态。 正常流程不会自动合并或自动覆盖云端；every remote mutation remains operator-triggered until you explicitly choose an import action. `保护此快照` / `取消保护` only updates retention metadata, so it is a 手动元数据操作 and 不代表立即导入或恢复. This route still does not require SQL or a generic cloud history backend.

## Troubleshooting

### "备份读取失败，请检查文件格式"

Cause:

- checksum mismatch
- invalid JSON
- file not generated by GeoHelper flow

Action:

1. Re-export from source environment.
2. Avoid manually editing JSON.
3. Re-import with the fresh file.

### Import succeeded but data looks unchanged

Cause:

- wrong strategy selected
- imported snapshot has older records for same `conversation.id` / `preset.id`

Action:

1. Retry with `覆盖导入` if full replacement is intended.
2. For `合并导入`, verify `updatedAt` in source backup is newer.

### How do I undo a bad import quickly?

Action:

1. Open `设置` -> `数据与安全` -> `备份与恢复`.
2. Find the `导入前恢复锚点` card.
3. Review the source, import mode, and outcome summary labels.
4. If the card warns that current local conversations changed again after import, confirm that you still want to discard those newer changes too.
5. Click `恢复到导入前状态`.

Notes:

- this rollback anchor is local to the current browser profile
- it stores only the latest pre-import state
- clearing browser storage or switching profiles can remove access to it

### Remote backup admin token is unavailable

Cause:

- the encrypted gateway admin token was restored into a different browser profile
- local secure keys were cleared after the token was saved

Action:

1. Open `设置` -> `备份与恢复` after remote sync actions are available.
2. Re-enter the gateway admin token.
3. Retry `上传最新快照` or `拉取最新快照`.

### "BYOK 密钥不可用" after restore

Cause:

- local encrypted key cannot be decrypted in current browser profile/keychain context

Action:

1. Open `设置` -> `BYOK 预设`.
2. Locate the warned preset.
3. Re-enter API Key and save.
4. Retry the request.

### Newer schema warning

Cause:

- backup came from a newer app build

Action:

1. Prefer upgrading GeoHelper to a matching/newer version before import.
2. If import is urgent, continue with `合并导入` and verify key conversations/presets after import.
