# GeoHelper Agent VNext Design

Date: 2026-03-17  
Status: Proposed

## 1. Why This Redesign Exists

GeoHelper 当前的 Agent 更准确地说，是一个 `geometry compile prompt chain`，而不是一个真正以“产物审查”和“证据迭代”为核心的 Agent 系统。

目前 Gateway 侧主流程基本是：

1. `intent`
2. `planner`
3. `command`
4. `verifier`
5. `repair`

这个链条对“把一句话尽快变成一组 GeoGebra 指令”是有效的，但对老师实际使用场景仍有三个问题：

1. 它把重点放在“拿到一份合法 JSON”上，而不是“拿到一份老师敢继续讲、敢继续改的图形草案”。
2. 它缺少像 `manim-generator` 那样的 `draft -> review -> execute/evidence -> revise` 闭环，所以失败和不确定性更多被压扁成了一次性 fallback。
3. 它的输出结构仍然偏“请求结果”，而不是“可审查的工作包”，这让浏览器端只能展示摘要，难以展示 agent 为什么这样画、哪里不确定、哪一轮修过什么。

因此，这次 redesign 的目标不是把旧链条再加两步，而是把 GeoHelper Agent 改造成一个 `artifact-centric workflow`：

1. 先生成草案包，而不是直接把草案丢给最终 UI。
2. 用 reviewer 审查草案和风险，而不是只做 schema 验证。
3. 把验证证据和浏览器执行证据都纳入工作流。
4. 最终向老师交付 `review packet`，而不是只有一段总结文案。

## 2. What To Borrow From `manim-generator`

参考项目：[`makefinks/manim-generator`](https://github.com/makefinks/manim-generator)

我建议借鉴它的不是表面上的 “Code Writer / Code Reviewer” 命名，而是以下四个更本质的思路：

1. `产物优先`
   - `manim-generator` 把“生成中的代码”视为第一等对象，并为每轮保存 code、review、logs、reasoning、frames。
   - GeoHelper 也应该把“几何草案包”视为第一等对象，而不是只有最终 `CommandBatch`。

2. `reviewer 独立存在`
   - 参考项目不是让同一个 prompt 一次性包办生成与自检，而是显式引入 reviewer。
   - 这很适合 GeoHelper，因为教师制图场景最需要的是“哪里不确定、哪里可能错、哪里要提醒老师确认”。

3. `执行证据驱动 revision`
   - 参考项目会把 execution logs、scene success rate、frames 反馈给 reviewer，再触发 revision。
   - GeoHelper 虽然没有 Manim 渲染器，但有两类证据可用：
   - Gateway 侧的 `preflight evidence`
   - Browser 侧的 `canvas execution evidence`

4. `工件留存与可观测性`
   - `manim-generator` 把步骤产物、执行历史、token/cost、成功率都当成 workflow 的一部分。
   - GeoHelper 也应该把每次 Agent run 视为可追踪实体，而不是只存 trace id 和 agent step timing。

## 3. What Not To Copy

GeoHelper 不应照搬 `manim-generator` 的这些点：

1. 不把 Agent 做成 CLI-first 的离线生成器。
2. 不把服务器变成图形运行时或权威状态源。
3. 不把 browser 本地工作状态迁到 Gateway。
4. 不引入多租户任务队列、异步 job backend 或 SaaS control plane。
5. 不为了“自动修复”越过老师显式确认。

GeoHelper 的 Agent vNext 必须继续服从当前产品边界：

1. `teacher-first diagram studio`
2. `local-first`
3. `single-tenant self-hosted gateway`
4. `snapshot-based recovery`

## 4. Design Goals

### 4.1 Must Have

1. 把 Agent 输出从 `CommandBatch result` 升级成 `AgentRun packet`。
2. 让 reviewer 成为显式阶段，而不是隐含在 prompt 里。
3. 让不确定项、修复建议、命名计划、讲解草案进入结构化输出。
4. 支持浏览器将执行后的画布证据回传到后续 repair/review。
5. 让 Gateway 与 Direct runtime 共用同一套阶段语义和协议。

### 4.2 Nice To Have

1. 记录每轮 revision 的原因。
2. 记录 object inventory、命名计划命中率、未解析标签等质量指标。
3. 支持在老师面板中回看每一轮审查摘要。

### 4.3 Explicit Non-Goals

1. 不做实时协作。
2. 不做云端 message history。
3. 不做 server-authoritative workspace。
4. 不做后台自动 pull / merge / restore。
5. 不做账户体系、权限体系、计费系统。

## 5. Redesign Options

### Option A: Harden The Existing Chain

做法：

1. 保留 `intent -> planner -> command -> verifier -> repair`
2. 增强 prompt
3. 增强 schema
4. 在返回结果里塞更多 summary / warning

优点：

1. 改动最小。
2. 最快上线。
3. 对现有测试改动较少。

缺点：

1. 本质仍是“链式生成器”，不是 artifact workflow。
2. reviewer 仍然不独立。
3. 浏览器无法接入 execution evidence 驱动 revision。
4. 老师侧仍然拿不到清晰的草案审查包。

结论：不推荐。它会继续把系统锁死在“生成 JSON”心智里。

### Option B: Dual-Agent Draft / Review / Revise Loop

做法：

1. 用 `Geometry Author` 生成草案包。
2. 用 `Geometry Reviewer` 审查草案包。
3. reviewer 不通过时，用 `Geometry Reviser` 生成下一版。
4. 最后进入 preflight validation。

优点：

1. 已经显著接近 `manim-generator` 的核心思想。
2. 能把不确定项和修复理由结构化。
3. Gateway 落地成本可控。

缺点：

1. 执行证据仍然主要停留在 Gateway preflight。
2. 浏览器执行后的对象结果，还没有进入 loop。

结论：是很好的第一阶段方案。

### Option C: Full Artifact-Centric Agent Workflow

做法：

1. 采用 Option B 的 author / reviewer / reviser。
2. 把 `preflight evidence` 和 `canvas execution evidence` 都接入 workflow。
3. 引入一等实体 `AgentRun`、`DraftPackage`、`ReviewReport`、`ExecutionEvidence`、`TeacherReviewPacket`。
4. 允许老师在浏览器端基于实际画布结果发起 targeted repair。

优点：

1. 最贴合 GeoHelper 的 teacher studio 路线。
2. 真正借到了 `manim-generator` 的 workflow 思想，而不是只借命名。
3. 可以把“老师是否信任这轮生成”变成可观察、可解释的界面体验。

缺点：

1. 涉及协议、Gateway、Web 状态层和结果面板重构。
2. 需要设计一个新的 `AgentRun` 数据模型。

结论：推荐作为目标方案。

## 6. Recommended Direction

推荐采用 `Option C`，但按 `B -> C` 的方式分阶段推进：

1. 第一阶段先做 `draft / review / revise / preflight`。
2. 第二阶段再把浏览器 `canvas execution evidence` 接入 repair loop。
3. 第三阶段删除旧的 `multi-agent.ts` 链式实现。

这样做的原因是：

1. 它保留了 `manim-generator` 最有价值的部分：review loop、execution evidence、artifact logging。
2. 它仍然符合 GeoHelper 的 `local-first` 边界，因为浏览器画布证据由浏览器持有和显式提交。
3. 它不会把 Gateway 推向更重的后台形态。

## 7. Core VNext Model

### 7.1 First-Class Entity: `AgentRun`

Agent vNext 的第一等实体不再是 `compile response`，而是 `AgentRun`。

一个 `AgentRun` 至少包含：

1. `run`
   - id
   - runtime target
   - mode
   - status
   - startedAt
   - finishedAt
   - totalDurationMs
   - iterationCount

2. `draft`
   - normalizedIntent
   - assumptions
   - constructionPlan
   - namingPlan
   - commandBatchDraft
   - teachingOutline
   - reviewChecklist

3. `reviews`
   - 每轮 reviewer 的 verdict
   - correctness issues
   - ambiguity issues
   - teaching clarity issues
   - repair instructions

4. `evidence`
   - preflight validation issues
   - dependency graph summary
   - referenced labels
   - generated object inventory
   - browser canvas evidence

5. `teacherPacket`
   - summary
   - warnings
   - uncertainties
   - suggested next actions
   - canvas links

6. `telemetry`
   - per-stage duration
   - upstream call count
   - retry count
   - degraded mode flags

### 7.2 Structured Subdocuments

建议引入以下协议对象：

1. `GeometryDraftPackage`
2. `GeometryReviewReport`
3. `GeometryPreflightEvidence`
4. `GeometryCanvasEvidence`
5. `GeometryTeacherReviewPacket`
6. `AgentRunEnvelope`

其中最关键的是把“命令 batch”从唯一主角，降级为 `draft package` 里的一个字段。

## 8. Proposed Workflow

### Stage 1: Intake

输入：

1. 用户请求
2. 最近对话
3. 最近 scene transactions
4. 可选图片附件

输出：

1. `normalized intent`
2. `request scope`
3. `risk hints`

### Stage 2: Geometry Author

`Geometry Author` 负责输出第一版 `GeometryDraftPackage`。

它不只写命令，还要同时产出：

1. 约束理解
2. 构图计划
3. 对象命名计划
4. 讲解线索
5. 初版 command batch
6. reviewer checklist

### Stage 3: Geometry Reviewer

`Geometry Reviewer` 不负责生成命令，而是站在“老师是否应信任这版草案”的视角审查：

1. 是否漏条件
2. 是否对象命名不清
3. 是否构图步骤跳跃
4. 是否存在约束矛盾
5. 哪些地方需要显式老师确认

输出是结构化 `GeometryReviewReport`。

### Stage 4: Geometry Reviser

如果 reviewer verdict 不是 `approve`，则由 `Geometry Reviser` 基于：

1. 当前 draft
2. review report
3. 上轮 evidence

生成下一版 draft。

默认限制：

1. 最多 2 到 3 轮 revision
2. 每轮必须记录 `revision_reason`
3. 超限后返回 `degraded but reviewable`，而不是无限 retry

### Stage 5: Preflight Validator

`Preflight Validator` 不调用 GeoGebra，但做可确定性的静态检查：

1. schema validation
2. dependency order validation
3. blocked operation validation
4. label extraction
5. object reference inventory

输出 `GeometryPreflightEvidence`。

### Stage 6: Teacher Review Packet

当 Gateway 或 Direct runtime 结束主要生成阶段后，返回给浏览器的不再是简单 compile result，而是：

1. final draft
2. review history summary
3. preflight evidence
4. teacher packet
5. stage telemetry

浏览器据此展示：

1. 这轮生成的图形意图
2. 不确定项
3. 风险提示
4. 推荐下一步动作
5. 若执行后失败，可直接发起 repair

### Stage 7: Browser Canvas Evidence

浏览器执行 `command batch` 后，生成 `GeometryCanvasEvidence`：

1. executed command count
2. failed command ids
3. created object labels
4. visible object labels
5. optional scene XML excerpt or viewport snapshot metadata
6. teacher-selected issue focus

这一步是 GeoHelper 对 `manim-generator execution feedback` 的本地化改造。

### Stage 8: Targeted Repair

老师可基于具体问题发起 repair：

1. “补一条辅助线”
2. “修复待确认条件”
3. “根据当前画布重新命名对象”
4. “基于当前结果生成讲解思路”

repair 请求会携带：

1. original draft
2. current teacher packet
3. canvas evidence
4. teacher instruction

## 9. Runtime Split

### 9.1 Gateway Runtime

Gateway 负责：

1. author / reviewer / reviser prompt orchestration
2. preflight validation
3. trace and metrics
4. optional run artifact logging

Gateway 不负责：

1. 浏览器状态权威
2. 自动恢复本地工作区
3. GeoGebra 真实渲染

### 9.2 Direct Runtime

Direct runtime 仍然保留，但语义改成：

1. 使用同一套 `AgentRunEnvelope`
2. 在浏览器里直接执行 author / reviewer / reviser prompt loop
3. 不提供服务器侧 metrics / operator traces
4. 在 UI 中显式标注为 `direct / limited observability`

这保证了 dual runtime 结构不被打破。

## 10. Web Experience Changes

### 10.1 Agent Run Becomes Primary UI Object

当前结果面板主要围绕：

1. summary
2. warnings
3. uncertainties
4. agent steps

vNext 需要升级为围绕 `AgentRun` 展示：

1. draft summary
2. reviewer verdict
3. uncertainties
4. preflight evidence
5. canvas evidence
6. revision history
7. next actions

### 10.2 Message Is No Longer The Main Container

建议把 `chat message.result` 降级为轻量索引，真正的结构数据进入独立 `agent-run store`。

原因：

1. `AgentRun` 比一条消息复杂得多。
2. 后续 repair、review、canvas evidence 都是围绕 run 发生，不是围绕消息文本本身发生。

## 11. Protocol and File-Level Design

建议新增和调整的核心文件如下。

### 11.1 Protocol

新增：

1. `packages/protocol/src/agent-run.ts`

调整：

1. `packages/protocol/src/index.ts`

### 11.2 Gateway

新增：

1. `apps/gateway/src/services/agent-workflow.ts`
2. `apps/gateway/src/services/geometry-author.ts`
3. `apps/gateway/src/services/geometry-reviewer.ts`
4. `apps/gateway/src/services/geometry-reviser.ts`
5. `apps/gateway/src/services/geometry-preflight.ts`
6. `apps/gateway/src/routes/agent-runs.ts`

调整：

1. `apps/gateway/src/services/compile-events.ts`
2. `apps/gateway/src/services/metrics.ts`
3. `apps/gateway/src/routes/compile.ts`

删除目标：

1. `apps/gateway/src/services/multi-agent.ts`
2. `apps/gateway/src/services/compile-agent.ts`

### 11.3 Web

新增：

1. `apps/web/src/state/agent-run-store.ts`
2. `apps/web/src/state/canvas-evidence.ts`
3. `apps/web/src/components/agent-run-panel.tsx`

调整：

1. `apps/web/src/runtime/types.ts`
2. `apps/web/src/runtime/gateway-client.ts`
3. `apps/web/src/runtime/direct-client.ts`
4. `apps/web/src/state/chat-send-flow.ts`
5. `apps/web/src/state/chat-store.ts`
6. `apps/web/src/components/studio-result-panel.ts`

## 12. Observability

`manim-generator` 的一个关键优点是“每一轮都留痕”。GeoHelper vNext 也应该把以下内容变成一等可观测对象：

1. `run status`
2. `iteration count`
3. `review verdict distribution`
4. `preflight failure categories`
5. `canvas repair trigger rate`
6. `teacher confirmation rate`
7. `degraded mode rate`

建议：

1. compile events 升级成 agent run events
2. metrics 从 compile success/failure 扩展到 run quality metrics
3. trace details 页面未来直接展示一次 run 的全阶段摘要

## 13. Risks and Mitigations

### Risk 1: Prompt Cost Increases

因为从单链条变成 author + reviewer + reviser，多轮调用必然增加。

缓解：

1. 限制默认 revision 次数
2. 对明显简单请求允许 reviewer 快速通过
3. 把 direct runtime 标记为高成本模式

### Risk 2: Protocol Becomes Too Heavy

如果 `AgentRunEnvelope` 设计过大，浏览器状态会变重。

缓解：

1. 只保留必要摘要
2. 原始 prompt / raw response 不进入主状态
3. 重证据写入 trace / operator sink，而不是写入聊天快照

### Risk 3: Browser Evidence Scope Expands Uncontrollably

缓解：

1. 第一阶段只上传结构化 `canvas evidence`
2. 图片或 XML 只做可选字段
3. 所有 repair 都由老师显式触发

## 14. Migration Strategy

这次 redesign 不要求兼容旧 Agent，因此建议采用 `clean cut with staged deletion`：

1. 先新增 `v2 agent run` 协议和 route。
2. web 面板切到 `AgentRun`。
3. 完成 browser evidence repair loop。
4. 删除旧 `multi-agent.ts` 和旧结果映射层。

当前状态：

1. 以上四步已按计划落地。
2. `apps/gateway/src/routes/compile.ts` 现在只保留 `/api/v1/chat/compile` 的 legacy response adapter。
3. Gateway 的主执行内核已经统一为 `author -> reviewer -> optional reviser -> preflight -> AgentRunEnvelope`。
4. 旧 `multi-agent.ts` 与 `compile-agent.ts` 已删除。

这样能避免“新旧结构互相妥协”导致的长期复杂度。

## 15. Final Recommendation

GeoHelper 新 Agent 不应该再被规划成“更复杂的 compile chain”，而应该被定义成：

> 一个面向老师制图工作流的、以 `draft + review + evidence + revision + teacher packet` 为核心的 Agent workflow。

如果只用一句话概括这次 redesign：

1. `manim-generator` 借给 GeoHelper 的，不是“多 Agent”，而是“把生成物当成可审查、可修正、可留痕的工作对象”。
2. GeoHelper vNext 要做的，就是把几何生成从“出一份 JSON”升级为“交付一份老师可以审查、修正、继续讲的图形工作包”。
