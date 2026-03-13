import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("remote sync docs", () => {
  it("documents the user-facing lightweight cloud sync terminology", () => {
    const txt = fs.readFileSync(
      "docs/user/settings-backup-recovery.md",
      "utf8"
    );

    expect(txt).toContain("轻量云同步");
    expect(txt).toContain("关闭");
    expect(txt).toContain("仅提醒（启动检查）");
    expect(txt).toContain("延迟上传");
    expect(txt).toContain("检查云端状态");
    expect(txt).toContain("上传最新快照");
    expect(txt).toContain("拉取最新快照");
    expect(txt).toContain("拉取所选历史快照");
    expect(txt).toContain("启动检查只拉取元数据");
    expect(txt).toContain("不会自动拉取或自动导入");
    expect(txt).toContain("不是完整云端聊天历史");
    expect(txt).toContain("保留历史");
    expect(txt).toContain("snapshot_id");
    expect(txt).toContain("guarded 写入");
    expect(txt).toContain("默认上传不会自动覆盖");
    expect(txt).toContain("仍然覆盖云端快照");
    expect(txt).toContain("显式危险操作");
    expect(txt).toContain("保护此快照");
    expect(txt).toContain("取消保护");
    expect(txt).toContain("受保护快照");
    expect(txt).toContain("普通保留历史");
    expect(txt).toContain("protected snapshots do not auto-expire");
    expect(txt).toContain("new protect requests fail explicitly when protected capacity is full");
    expect(txt).toContain("手动元数据操作");
    expect(txt).toContain("不代表立即导入或恢复");
    expect(txt).not.toContain("上传到网关");
    expect(txt).not.toContain("从网关拉取");
    expect(txt).not.toContain("会自动合并云端");
    expect(txt).not.toContain("会自动覆盖云端");
  });
});
