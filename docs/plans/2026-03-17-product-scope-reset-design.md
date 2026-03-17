# GeoHelper Product Scope Reset Design

Date: 2026-03-17  
Status: Adopted as the current strategic boundary on 2026-03-17

## 1. Why This Reset Exists

GeoHelper 过去两周已经连续完成了几条重要路线：

1. Web 端已经从基础聊天壳发展为更明确的 `teacher diagram studio` 工作台。
2. Gateway 已经从“能转发请求”的薄代理，演进为可自托管、可观测、可恢复的单租户控制面。
3. 远端恢复能力已经补齐到“轻量云端快照同步 / 历史查看 / 手动导入恢复”的成熟形态。
4. 可维护性专项已经把一批热点文件拆分，并建立了持续性的质量护栏。

问题不再是“功能不够多”，而是“整体叙事仍然容易被误读”。如果没有一个新的总纲，后续计划很容易继续朝下面这些方向滑动：

1. 把远端快照恢复误解成“完整云聊天产品”的起点。
2. 把 Gateway 误解成未来会扩张成 SaaS 后台或多租户控制台。
3. 把教师制图台误解成聊天 UI 的一次视觉改版，而不是产品主心智的迁移。

这份文档的目的，是把 GeoHelper 的稳定产品边界明确下来，并把已有 roadmap 重新解释成同一条主线下的阶段成果，而不是通向更重后台产品的过渡版本。

## 2. Product Statement

GeoHelper 的当前定义应当固定为：

> 一个面向老师与几何内容创作者的、`local-first` 的 GeoGebra 制图工作台。  
> 它使用 LLM 把截图题、文字题、草图题转成可编辑图形，并在浏览器里继续编辑、校正、演示与导出。  
> 当用户需要跨设备恢复或自托管能力时，可以接入一个轻量单租户 Gateway，获得显式的远端快照存储、恢复和运维能力。

这一定义包含四个关键点：

1. `制图工作台` 是主产品心智，不是聊天壳。
2. `浏览器本地工作状态` 是主数据面，不是服务器权威状态。
3. `Gateway` 是可选的自托管增强层，不是中心化业务后台。
4. `远端同步` 是快照级恢复能力，不是消息级云历史。

## 3. What GeoHelper Is

GeoHelper 当前应该被视为以下能力的组合：

1. `Teacher-first diagram studio`
   - 首页、模板、输入 rail、结构化结果 rail、画布区共同服务“把题目变成可编辑几何图”这一主路径。
2. `Local-first creative runtime`
   - 对话、图形、模板、导入导出与恢复的主工作状态优先保留在浏览器侧。
3. `Dual runtime app`
   - 既支持 `Direct BYOK`，也支持带策略控制与编译编排的 `Gateway` 运行时。
4. `Single-tenant self-hostable gateway`
   - Gateway 负责鉴权、编译编排、运维检查、快照存储与恢复辅助，而不是承担多租户业务系统职责。
5. `Snapshot-based remote recovery`
   - 远端能力服务于跨设备恢复、人工核对、显式导入，不服务于实时协作或服务器主导的历史回放。

## 4. What GeoHelper Is Not

下面这些方向应当明确写入“当前不做”的边界，而不是作为默认后续阶段：

1. 不是“完整云聊天产品”。
2. 不是 message-level 的云端历史系统。
3. 不是 server-authoritative state 的在线工作区。
4. 不是自动后台 pull / merge / restore 的同步工具。
5. 不是需要 SQL / OLTP 表结构的业务后端。
6. 不是多租户 workspace 平台。
7. 不是带用户系统、权限体系、billing、协作后台或 admin console 的 SaaS。
8. 不是实时协作白板或多人编辑系统。

如果未来某个新方案必须引入上述任一前提，它默认不属于当前 GeoHelper 路线，应单独论证，而不是悄悄附着在现有 roadmap 上继续推进。

## 5. Stable Architecture Boundary

未来所有 roadmap 都应遵守下面这些稳定边界：

### 5.1 Browser Owns the Working State

1. 浏览器中的当前会话、草稿、图形工作状态仍然是第一数据面。
2. 即使存在远端快照，浏览器也不应在启动时自动覆盖本地状态。
3. 任何“恢复 / 导入 / 替换”动作都必须是显式用户操作。

### 5.2 Gateway Stays Thin and Single-Tenant

1. Gateway 继续聚焦于 auth、compile orchestration、policy、operator visibility、snapshot storage。
2. Gateway 可以更稳、更易部署、更可观测，但不扩张为重业务后台。
3. Gateway 默认按单租户自托管模型理解，不引入账户域、多组织域、多工作区域。

### 5.3 Remote Sync Stays Snapshot-Based

1. 远端同步单位仍然是 `validated snapshot`。
2. 比较、冲突、历史浏览、保护、回滚锚点等都围绕 snapshot 语义展开。
3. 不演进到 message log、server merge engine、timeline replay、background reconciliation。

### 5.4 Safety Over Automation

1. 可以增加更强的 compare、preview、guidance、rollback 保护。
2. 可以增加更稳的上传节流、状态提示、操作证据。
3. 不能为了“自动化体验”而越过本地优先和手动恢复边界。

## 6. How To Reinterpret Existing Roadmaps

这一步很关键，因为我们不是要推翻已有文档，而是要重新解释它们。

### 6.1 2026-03-04 to 2026-03-08 Foundation Docs

[`2026-03-04-geogebra-llm-app-design.md`](./2026-03-04-geogebra-llm-app-design.md) 到 2026-03-08 的一系列基础设计与响应式文档，应被视为：

1. GeoHelper 的产品与运行时基座。
2. `local-first` + GeoGebra + LLM 的交互和持久化基础。
3. 当前所有后续 UI / runtime 方案的稳定前置条件。

### 6.2 Backend V2 to V7-M

[`2026-03-11-backend-v2-roadmap.md`](./2026-03-11-backend-v2-roadmap.md) 到 [`2026-03-14-backend-v7m-rollback-anchor-overwrite-guard-roadmap.md`](./2026-03-14-backend-v7m-rollback-anchor-overwrite-guard-roadmap.md) 应统一理解为：

1. `自托管 Gateway + 本地优先快照恢复` 这一条线已经基本闭环。
2. 这些文档不是通向 SaaS、SQL、云端聊天历史的台阶。
3. 它们的价值在于让自托管用户拥有“够稳、够安全、够可恢复”的个人或小团队级工作流。

### 6.3 VNext Teacher Diagram Studio

[`2026-03-14-vnext-teacher-diagram-studio-design.md`](./2026-03-14-vnext-teacher-diagram-studio-design.md) 与 [`2026-03-14-vnext-teacher-diagram-studio-implementation-plan.md`](./2026-03-14-vnext-teacher-diagram-studio-implementation-plan.md) 代表当前最重要的产品表达方向：

1. GeoHelper 的核心价值是“出图 + 可编辑 + 可继续讲解”，而不是聊天本身。
2. 后续产品优先级应围绕老师的制图工作流组织，而不是围绕通用 chat feature checklist 组织。
3. 证明辅助、模板、结果结构化、演示与导出，都应当接入这条教师工作台主链路。

### 6.4 Maintainability Series

2026-03-16 到 2026-03-17 的 maintainability 文档应被视为：

1. 为当前产品边界持续降复杂度、控热点、补测试可读性。
2. 目的是提高继续演进 teacher studio 与 Gateway 的速度和稳定性。
3. 不是替代产品路线，而是为产品路线保留工程可持续性。

## 7. Adopted Product Boundary

从 2026-03-17 起，GeoHelper 的产品边界采用下面这套简化定义：

### 7.1 Core Identity

GeoHelper 是：

1. 一个老师可直接使用的题图制图台。
2. 一个本地优先、浏览器内可持续工作的几何创作环境。
3. 一个可选接入自托管 Gateway 的增强型运行时。
4. 一个提供快照级恢复与轻量跨设备接续的工具，而非云端主工作区。

### 7.2 Non-Negotiable Constraints

GeoHelper 不做：

1. 全量 cloud chat sync。
2. message-level 云端历史。
3. server-authoritative chat/workspace state。
4. 自动云端恢复、自动后台 pull、自动 merge。
5. SQL / OLTP 业务存储扩张。
6. 用户系统、权限体系、billing、admin console。
7. 多租户工作区和实时协作。

## 8. Near-Term Roadmap Under The New Boundary

下一阶段不应该继续扩“后台产品面”，而应收敛为四条并行但边界清晰的主线。

### 8.1 Track A: Teacher Studio Workflow Completion

目标：把现有 `teacher diagram studio` 从“方向已成立”推进到“主链路非常顺手”。

优先补齐：

1. 输入到结果的连续反馈，让老师更快判断“这一轮生成是否可信”。
2. 结构化结果中的不确定项确认、补图动作、讲解动作衔接。
3. 模板、最近图稿、继续编辑之间的快速切换。
4. 课堂使用场景下的演示、导出、展示态。

### 8.2 Track B: Generation Reliability and Reviewability

目标：减少“生成了，但老师不敢用”的情况。

优先补齐：

1. 结果摘要和步骤解释的一致性。
2. 错误提示、失败恢复、二次尝试和保守降级。
3. 对象关系、几何约束、命名和缺失项的可见性。
4. 更明确的“需要老师确认”的界面语义。

Track A 与 Track B 的当前执行落地计划见 [`2026-03-17-teacher-studio-review-flow-implementation-plan.md`](./2026-03-17-teacher-studio-review-flow-implementation-plan.md)。

### 8.3 Track C: Local-First Recovery and Self-Hosted Ops Polish

目标：保持当前远端快照路线，但只做“更稳更清晰”，不做“更云更重”。

优先补齐：

1. 备份 / 拉取 / 导入 / 回滚的用户教育与文档可理解性。
2. Gateway 部署、验证、告警、恢复演练的低摩擦流程。
3. snapshot 比较和恢复信息的表达统一。
4. 针对单租户自托管用户的默认值与运维护栏。

### 8.4 Track D: Maintainability Ratchet

目标：继续压制复杂度回弹，保证后续还能快速改产品。

优先补齐：

1. 热点文件预算、模块职责、测试可读性持续收紧。
2. 文档索引与运行时边界保持同步。
3. 对复杂模块继续拆分为更稳定的 helpers / adapters / services。
4. 让“新增功能不把边界做糊”成为日常工程习惯。

## 9. Explicitly Deferred Capabilities

下面这些能力可以记录为“已明确延期 / 当前拒做”，避免后续反复讨论：

1. 用户登录体系与云账号。
2. 多设备自动聊天历史同步。
3. 按消息增量同步、冲突自动合并、服务器权威会话树。
4. 多租户组织空间、成员管理、共享权限。
5. 在线协作编辑、实时 presence、多人白板。
6. SaaS 控制台、后台运营面板、计费面板。
7. SQL 驱动的业务实体扩张。

这些能力如果未来真的要做，应被视为“新产品线或新架构路线”，而不是 GeoHelper 当前计划的自然下一个版本号。

## 10. Decision Rules For Future Plans

从现在开始，每一份新的 roadmap / design / implementation plan，都应先回答下面四个问题：

1. 这个方案是否直接强化了 `teacher diagram studio` 主链路？
2. 这个方案是否保持 `local-first`，而不是把状态权威迁到服务器？
3. 这个方案是否仍可在 `single-tenant self-hosted gateway` 语义下成立？
4. 这个方案是否会把产品误导成“完整云聊天产品”？

如果第 4 个问题的答案是“会”，或者第 2 / 3 个问题的答案是否定的，这个方案默认不进入当前主 roadmap。

## 11. Recommended Reading Order After This Reset

在新的产品边界下，建议按下面顺序理解项目：

1. 先读本文件，确认 GeoHelper 的稳定边界。
2. 再读 [`2026-03-14-vnext-teacher-diagram-studio-design.md`](./2026-03-14-vnext-teacher-diagram-studio-design.md)，理解产品主表达。
3. 然后读 [`2026-03-04-geogebra-llm-app-design.md`](./2026-03-04-geogebra-llm-app-design.md) 和 [`2026-03-05-dual-runtime-architecture-design.md`](./2026-03-05-dual-runtime-architecture-design.md)，理解 runtime 基座。
4. 需要理解自托管与恢复能力时，再读 Backend `V2` 到 `V7-M` 路线。
5. 需要推进工程质量时，再读 maintainability 系列文档。

## 12. Conclusion

GeoHelper 的下一阶段，不是去补一个“更像云聊天产品”的后台故事，而是把已经形成雏形的三件事做深、做稳、做顺：

1. `老师制图工作台`
2. `本地优先创作与恢复`
3. `轻量自托管 Gateway`

只要后续计划始终围绕这三件事展开，GeoHelper 的路线就会越来越清晰；反之，只要开始默认补 SaaS 后台、云端消息历史、多租户协作，它就会重新失焦。
