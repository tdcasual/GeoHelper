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
    expect(txt).toContain("启动检查只拉取元数据");
    expect(txt).toContain("不会自动拉取或自动导入");
    expect(txt).toContain("不是完整云端聊天历史");
    expect(txt).not.toContain("上传到网关");
    expect(txt).not.toContain("从网关拉取");
  });
});
