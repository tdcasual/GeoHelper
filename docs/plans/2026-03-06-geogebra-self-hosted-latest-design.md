# GeoHelper 设计方案（GeoGebra 全量自托管：构建期自动拉取最新并失败回退）

- 日期：2026-03-06
- 状态：已评审确认
- 目标：在静态部署场景下，将 GeoGebra 运行资源改为全量自托管；构建时优先自动拉取官方最新 Bundle，拉取或校验失败时自动回退到可用版本。
- 许可假设：当前使用场景为非商业、个人自用教学；若未来变为收费课程、平台化分发或商业化服务，需要重新审查 GeoGebra 许可条款。

## 1. 背景与问题定义

当前项目前端在运行时直接加载 GeoGebra 官方远程脚本 `https://www.geogebra.org/apps/deployggb.js`，并由该脚本继续拉取 CSS、字体、语言资源与 HTML5 `web3d` 分片。这种方式能快速接入，但存在以下问题：

1. 生产环境对 `geogebra.org` 存在强依赖，不满足“静态部署时全量自托管”的目标。
2. GeoGebra 上游版本可能变化，现网渲染结果不可控，难以回滚与排障。
3. 当前 E2E 仅验证 applet 被注入容器，不验证真实画布尺寸、外链请求与离线可用性。
4. 本地验证中发现当前 `CanvasPanel` 虽然能成功挂载 applet，但默认实现在部分场景下会出现容器高度异常，实际渲染区域被压缩。

因此，本次改造的核心不是单纯“下载一份 GeoGebra 资源”，而是建立一条可重复、可观测、可回退的 GeoGebra vendor 化发布链路。

## 2. 目标与非目标

### 2.1 目标

1. Web 产物发布后，GeoGebra 相关资源全部从本站静态资源目录加载。
2. 构建阶段自动尝试拉取 GeoGebra 官方“最新 Bundle”。
3. 若“最新 Bundle”下载失败、解压失败或结构校验失败，自动回退到上一次验证通过的版本。
4. 运行时不再依赖 `geogebra.org` 域名；构建后和 E2E 都要验证这一点。
5. GeoGebra 运行版本在构建产物中可见、可追踪、可诊断。
6. 同步修复当前画布尺寸初始化不稳定的问题，避免自托管改造后仍保留错误渲染行为。

### 2.2 非目标

1. 不在本次改造中引入完整 PWA 离线模式。
2. 不在本次改造中处理商业许可自动审计。
3. 不做 GeoGebra 资源的手工裁剪、按需瘦身或私有重打包。

## 3. 总体方案

采用“构建前 vendor 同步 + 运行时本地 manifest 装配”的两段式设计。

### 3.1 核心思想

1. 构建前脚本负责从官方入口解析最新 Bundle、下载压缩包、解压、校验、生成本地 manifest。
2. `apps/web/public/vendor/geogebra/` 作为 GeoGebra 静态资源根目录，由 Vite 在构建时原样复制到 `dist`。
3. 运行时前端不再硬编码远程 GeoGebra URL，而是先读取本地 manifest，再按 manifest 中的脚本与 codebase 路径初始化 applet。
4. 失败回退发生在构建期，而不是运行时。运行时只加载已经通过校验并写入产物的本地版本。

### 3.2 为什么采用构建期回退，而不是运行时回退

运行时回退会让线上用户面对两套资源来源，既增加诊断难度，也会削弱“全量自托管”的目标。构建期回退更适合静态站点：

1. 失败尽早暴露在 CI 或发布流程中。
2. 发布出去的永远是一套确定的本地资源。
3. 版本信息可以直接写入 manifest，便于问题定位与回滚。

## 4. 目录与产物设计

新增和约定以下目录结构：

1. `config/geogebra.vendor.json`
2. `scripts/geogebra/sync-bundle.mjs`
3. `.cache/geogebra/archives/`
4. `.cache/geogebra/extracted/`
5. `.cache/geogebra/last-known-good.json`
6. `apps/web/public/vendor/geogebra/manifest.json`
7. `apps/web/public/vendor/geogebra/current/`

其中：

- `.cache/geogebra/` 只作为本地与 CI 缓存，不参与前端产物发布。
- `apps/web/public/vendor/geogebra/current/` 是唯一对运行时暴露的 GeoGebra 根目录。
- `manifest.json` 是运行时读取的唯一入口。

### 4.1 `config/geogebra.vendor.json`

该文件保存人工可控的回退策略与同步行为，而不是保存“当前最新版本”。建议字段：

- `latestBundleUrl`: 官方 latest 入口地址。
- `fallbackVersion`: 显式保底版本，例如 `5.4.918.0`。
- `fallbackBundleUrl`: 对应保底版本 ZIP 地址。
- `requestTimeoutMs`: 下载超时。
- `allowCachedLastKnownGood`: 是否允许使用缓存中的 last-known-good。
- `expectedEntries`: 关键文件或目录白名单，用于结构校验。

### 4.2 `manifest.json`

建议写入以下字段：

- `resolvedVersion`
- `resolvedFrom`：`latest` / `fallback` / `last-known-good`
- `sourceUrl`
- `deployScriptPath`
- `html5CodebasePath`
- `builtAt`
- `integritySummary`

这个文件同时为开发排障提供证据链：构建到底用了哪个版本、来自哪一级回退、产物中应加载哪些本地路径。

## 5. 构建前同步流程

### 5.1 标准路径：优先拉取最新

构建前脚本 `scripts/geogebra/sync-bundle.mjs` 执行以下流程：

1. 请求 `latestBundleUrl`，跟随 HTTP 重定向，解析真实 ZIP 地址。
2. 从真实 ZIP 文件名中提取 GeoGebra 版本号。
3. 下载 ZIP 到 `.cache/geogebra/archives/<version>.zip`。
4. 解压到临时目录。
5. 自动探测 `deployggb.js`、`HTML5/*/web3d/`、样式、字体和语言资源是否存在。
6. 通过校验后，将结果同步到 `apps/web/public/vendor/geogebra/current/`。
7. 生成新的 `manifest.json`。
8. 将本次成功结果记录为 `last-known-good`。

### 5.2 回退路径：最新失败时自动降级

若标准路径任一环节失败，则按以下顺序回退：

1. 使用 `fallbackVersion` 对应 ZIP 重新执行下载、解压和校验。
2. 若显式保底版本也失败，则尝试读取 `.cache/geogebra/last-known-good.json` 指向的缓存版本。
3. 若 last-known-good 也不可用，则构建失败并退出。

这里的“失败”必须包括以下情况，而不是只看 HTTP 是否 200：

1. ZIP 下载中断或文件为空。
2. 解压后找不到 `deployggb.js`。
3. 无法探测到 `HTML5/*/web3d/`。
4. `deployggb.js` 存在，但 codebase 对应目录缺少关键资源。
5. 发布目录写入失败或 manifest 生成失败。

## 6. 运行时加载策略

前端运行时代码改造集中在 `CanvasPanel`。

### 6.1 新的加载顺序

1. 页面加载时先请求 `/vendor/geogebra/manifest.json`。
2. 根据 manifest 中的 `deployScriptPath` 注入本地 `deployggb.js`。
3. 创建 `GGBApplet` 实例。
4. 在 `inject()` 之前调用 `applet.setHTML5Codebase(manifest.html5CodebasePath)`。
5. 再完成 `inject()` 与 adapter 注册。

### 6.2 宿主尺寸策略

当前实现对 `width: "100%"` 和 `height: "100%"` 的依赖在实际浏览器中会导致 GeoGebra 高度被错误压缩。因此改造时应同步调整为：

1. 在 applet 初始化前读取 `.geogebra-host` 的实际像素宽高。
2. 将像素值作为 `width` 和 `height` 传入 `GGBApplet`。
3. 如后续需要支持窗口 resize，再单独追加 resize 重建或 resize 适配逻辑。

本次设计优先保证“首屏渲染正确 + 静态部署稳定”，不在同一轮引入复杂响应式重算机制。

## 7. 构建与脚本改造

建议在根目录 `package.json` 新增：

1. `geogebra:sync`
2. `build:web`

推荐构建链如下：

1. `pnpm geogebra:sync`
2. `pnpm --filter @geohelper/web build`

若要避免开发态每次启动都重新下载，可采用以下策略：

1. `dev` 默认只使用已有的 `current/` 资源。
2. `build` 必须先执行同步。
3. 若开发者需要手动更新 GeoGebra 版本，则显式执行 `pnpm geogebra:sync`。

这样可以避免本地开发体验被大 ZIP 下载拖慢，同时保证生产构建的完整性。

## 8. 验证策略

### 8.1 构建前校验

同步脚本必须在完成 vendor 更新前做完整性校验：

1. `deployggb.js` 存在。
2. `HTML5/*/web3d/` 目录存在。
3. 至少存在一组关键 CSS 资源。
4. 版本信息可从 ZIP 名称或路径稳定解析。

### 8.2 构建后校验

构建后增加自动检查：

1. 扫描 `apps/web/dist` 中是否仍包含 `geogebra.org` 字符串。
2. 若存在则直接失败，避免把外链依赖发布到生产。

### 8.3 E2E 校验

新增两类 E2E：

1. 阻断所有 `geogebra.org` 请求，页面仍能渲染 GeoGebra。
2. 断言 `#geogebra-container` 高度大于阈值，例如 `400px`，防止回归到“只有一条横条”的错误状态。

### 8.4 诊断输出

构建日志中至少打印：

1. latest 入口实际解析到的 ZIP URL。
2. 本次最终使用的版本号。
3. 本次命中的来源级别：`latest` / `fallback` / `last-known-good`。
4. 发布到 `public/vendor/geogebra/current/` 的真实 codebase 子路径。

## 9. 风险与约束

### 9.1 最新优先的稳定性风险

“自动拉取最新”天然牺牲部分可复现性，因此必须依赖回退链与清晰日志弥补。若后续发现最新版本频繁带来不可预期变动，可以收紧策略为“默认固定版本，人工批准后更新 latest”。当前阶段按用户偏好保留最新优先。

### 9.2 产物体积与发布时间

GeoGebra Bundle 体积较大，构建与上传耗时会增加。这是全量自托管的必要成本，应通过 CI 缓存减少重复下载。

### 9.3 许可边界

当前用途为非商业、个人教学，自部署策略按现有假设成立；但一旦用途发生变化，应重新确认 GeoGebra 许可范围。

## 10. 实施顺序

### Phase 1：Vendor 同步基础设施

1. 新增 `config/geogebra.vendor.json`。
2. 实现 `scripts/geogebra/sync-bundle.mjs`。
3. 生成 `manifest.json`。

### Phase 2：前端本地加载改造

1. `CanvasPanel` 改为读取本地 manifest。
2. 改为加载本地 `deployggb.js`。
3. 调用 `setHTML5Codebase()` 指向本地 `web3d`。
4. 修复画布像素尺寸初始化。

### Phase 3：验证与发布保护

1. 新增构建后 `dist` 外链扫描。
2. 新增零外链 E2E。
3. 新增画布高度阈值 E2E。
4. 更新部署文档。

## 11. 成功标准

满足以下条件即可视为本方案达成：

1. 构建完成后，GeoGebra 全量资源位于 `dist/vendor/geogebra/current/`。
2. 生产页面资源列表中不再出现 `geogebra.org`。
3. 官方 latest 可用时，构建默认跟随最新版本。
4. latest 不可用时，构建能自动回退到可用版本。
5. GeoGebra 首屏画布高度正常，不再出现异常压缩。
6. 版本来源与回退信息可通过 manifest 和构建日志追踪。

## 12. 参考资料

1. GeoGebra Apps Embedding: <https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_Embedding/>
2. GeoGebra App Parameters: <https://geogebra.github.io/docs/reference/en/GeoGebra_App_Parameters/>
3. GeoGebra License: <https://www.geogebra.org/license>
4. GeoGebra Math Apps Bundle: <https://download.geogebra.org/package/geogebra-math-apps-bundle>
