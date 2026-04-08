# GeoHelper OpenClaw-Portable Agent Spec V2 Design

Date: 2026-04-07  
Status: Proposed

## 1. Executive Summary

GeoHelper 当前已经具备平台型 agent 的基础内核：`run`、`workflow`、`artifact`、`checkpoint`、`memory`、`subagent`、`browser session` 和 `control-plane + worker` 拆分都已经存在。但这套内核仍然以 GeoHelper runtime 为中心，而不是以“可迁移 agent”本身为中心。

本方案的目标不是“完整兼容 OpenClaw runtime”，而是：

1. 彻底放弃对 GeoHelper 旧 agent 设计的兼容包袱。
2. 把 Agent 重构成一套 **可导出、可迁移、可宿主化** 的 Bundle 规范。
3. 让 GeoHelper 成为这种 Bundle 的一个宿主。
4. 让未来某个 Agent 迁移到 OpenClaw 时，只需要薄适配，而不是重写 Agent。

一句话定义目标：

> GeoHelper V2 应该兼容的是 **OpenClaw 风格的 agent portability**，而不是 OpenClaw 的全部内部 runtime 实现。

## 2. Why This Is The Right Compatibility Goal

OpenClaw 官方文档的重点，不是固定 workflow graph，而是：

1. `agent workspace + bootstrap files + session loop`
2. `context engine / memory / plugins` 的可替换性
3. `native sub-agents` 与 `ACP external agents` 的并行存在
4. `standing orders`、身份文件、工具声明、工作区文件共同塑造 agent

这意味着 OpenClaw 真正稳定的兼容面，更接近：

1. Agent 的文件组织
2. Agent 的声明式能力边界
3. Prompt / policy / memory / tools 的结构化资产
4. 可映射到不同宿主 runtime 的行为契约

而不是某个特定版本的内部调度器实现。

所以 GeoHelper 应该对齐的是：

1. Agent Bundle 结构
2. Workspace bootstrap 资产
3. Context / memory / tool / policy 的声明式规范
4. ACP / native subagent 这类外部互操作边界

不应该死绑的是：

1. OpenClaw 某一版内部 session manager 细节
2. 某一版插件槽位实现细节
3. 某一版 runtime orchestration 的私有行为

## 3. Hard Product Decisions

这次重构必须明确做出以下不可回头的决定：

1. 废弃“agent 只是轻量执行声明”的定义方式。
2. 废弃“domain package 工厂函数就是 agent 全部形态”的做法。
3. 废弃“subagent == 内部 child run”的唯一表达。
4. 废弃“GeoHelper runtime contract 就是 agent contract”的设计。
5. 接受“agent spec 是一等资产，runtime 只是宿主”。

## 4. Current Architecture Assessment

当前代码里，平台底座是有价值的，应该保留：

1. `packages/agent-core`
   - durable workflow execution
   - checkpoint / subagent / budget semantics
2. `packages/agent-store`
   - runs / events / artifacts / memory / browser sessions / engine states
3. `packages/agent-tools`
   - tool schema / permission / retry / timeout / audit
4. `packages/agent-memory`
   - ranked retrieval 和 write policy
5. `apps/control-plane` + `apps/worker`
   - 控制面和执行面已拆分

但现状仍然不适合 portability：

1. agent 定义过薄
2. prompt / identity / standing orders 没有文件化
3. bundle 不可导出
4. context engine 仍偏 runtime 内聚
5. planner / model / synthesizer 尚未成为真实可替换执行面
6. subagent 不能自然映射到 OpenClaw 的 native + ACP 双模型

## 5. Target Architecture

新架构分成三层。

### 5.1 Portable Bundle Layer

这是未来可以迁移出去的层。

它包含：

1. agent manifest
2. workspace bootstrap files
3. tool capability manifest
4. memory and context policy
5. standing orders
6. evaluator policy
7. subagent / delegation contracts
8. artifact contracts

要求：

1. 不依赖 GeoHelper 内部 store 表结构
2. 不依赖 GeoHelper route path
3. 不依赖 GeoHelper worker 进程模型
4. 可被 GeoHelper 和 OpenClaw 共同理解或映射

### 5.2 Host Adapter Layer

这是 GeoHelper 自己的宿主层。

它负责：

1. 把 portable bundle 挂到 GeoHelper runtime
2. 解析 GeoHelper 工作区状态
3. 调用 GeoHelper browser bridge / scene tools
4. 把 GeoHelper 的 runs、artifacts、checkpoints 映射到 bundle contract

这层允许 GeoHelper 私有扩展，但必须只向上暴露规范化 contract。

### 5.3 Export / Interop Layer

这是未来迁移到 OpenClaw 的出口。

它负责：

1. 把 bundle 导出为 OpenClaw-friendly workspace
2. 映射 tools / policies / standing orders
3. 生成 ACP 或 plugin manifest
4. 标出哪些能力需要宿主补齐

## 6. Core Design Principle

### Principle 1: Agent First, Runtime Second

Agent 是产品资产。Runtime 只是宿主。

### Principle 2: Files + Manifest, Not Factory Functions

Agent 形态必须以文件和 manifest 为主，而不是主要依赖 TypeScript 工厂函数拼装。

### Principle 3: Host Extensions Must Be Explicit

GeoHelper 私有能力必须通过 `hostCapabilities` 或 `hostExtensions` 显式声明，不能静默渗透进通用 spec。

### Principle 4: Declarations Over Hidden Conventions

身份、记忆、工具、评估、子代理策略都要可读、可导出、可检查。

### Principle 5: Portable Does Not Mean Lowest Common Denominator

可移植不等于只保留最弱能力。可以有强能力，但必须：

1. 标明 capability key
2. 标明 fallback
3. 标明导出时是否 degrade

## 7. Target Repository Shape

推荐新增一个独立的 agent bundle 根目录，例如：

```text
agents/
  geometry-solver/
    agent.json
    workspace/
      AGENTS.md
      IDENTITY.md
      USER.md
      TOOLS.md
      MEMORY.md
      STANDING_ORDERS.md
    prompts/
      planner.md
      executor.md
      synthesizer.md
      evaluator-teacher-readiness.md
    tools/
      scene.read_state.tool.json
      scene.apply_command_batch.tool.json
    evaluators/
      teacher_readiness.eval.json
    policies/
      context-policy.json
      memory-policy.json
      approval-policy.json
    artifacts/
      output-contract.json
    delegations/
      subagents.json
```

说明：

1. `agents/*` 是可迁移资产
2. `packages/agent-domain-*` 变成这些资产的宿主适配器和本地 helper
3. runtime 不直接把 TS 源码当作 agent 本体

## 8. Agent Bundle Spec V2

### 8.1 `agent.json`

建议核心结构：

```json
{
  "schemaVersion": "2",
  "id": "geometry-solver",
  "name": "Geometry Solver",
  "description": "Plans geometry constructions and produces classroom-ready diagram actions.",
  "entrypoint": {
    "plannerPrompt": "prompts/planner.md",
    "executorPrompt": "prompts/executor.md",
    "synthesizerPrompt": "prompts/synthesizer.md"
  },
  "workspace": {
    "bootstrapFiles": [
      "workspace/AGENTS.md",
      "workspace/IDENTITY.md",
      "workspace/USER.md",
      "workspace/TOOLS.md",
      "workspace/MEMORY.md",
      "workspace/STANDING_ORDERS.md"
    ]
  },
  "tools": [
    "tools/scene.read_state.tool.json",
    "tools/scene.apply_command_batch.tool.json"
  ],
  "evaluators": [
    "evaluators/teacher_readiness.eval.json"
  ],
  "policies": {
    "context": "policies/context-policy.json",
    "memory": "policies/memory-policy.json",
    "approval": "policies/approval-policy.json"
  },
  "artifacts": {
    "outputContract": "artifacts/output-contract.json"
  },
  "delegation": {
    "config": "delegations/subagents.json"
  },
  "hostRequirements": [
    "workspace.scene.read",
    "workspace.scene.write"
  ]
}
```

### 8.2 Workspace Files

GeoHelper V2 应主动采用接近 OpenClaw 的 workspace 文件体系。

建议：

1. `AGENTS.md`
   - 总体运行规则、协作约束、任务哲学
2. `IDENTITY.md`
   - 角色、语气、目标、长期边界
3. `USER.md`
   - 目标用户、用户偏好、默认语言、典型失败模式
4. `TOOLS.md`
   - 工具语义、限制、推荐调用模式
5. `MEMORY.md`
   - 允许写入和提升的记忆类型
6. `STANDING_ORDERS.md`
   - 常驻指令与宿主注入策略

这些文件既能被 GeoHelper 自己的 prompt assembler 使用，也能在导出到 OpenClaw 时直接复用。

## 9. Tool Manifest Design

每个工具需要独立 manifest。

建议结构：

```json
{
  "name": "scene.read_state",
  "kind": "browser",
  "description": "Read the active geometry scene state.",
  "inputSchemaRef": "#/schemas/SceneReadStateInput",
  "outputSchemaRef": "#/schemas/SceneReadStateOutput",
  "permissions": ["scene:read"],
  "retryable": true,
  "timeoutMs": 8000,
  "hostCapability": "workspace.scene.read",
  "export": {
    "openClaw": {
      "mode": "native-tool",
      "preferredTransport": "plugin"
    }
  }
}
```

关键点：

1. `hostCapability` 标记宿主依赖
2. `export.openClaw` 标记迁移目标下的映射方式
3. 工具 schema 不再只存在于 TS 类型里

## 10. Evaluator Manifest Design

Evaluator 也要变成可迁移资产。

建议结构：

```json
{
  "name": "teacher_readiness",
  "description": "Score whether the generated geometry output is ready for classroom use.",
  "promptRef": "prompts/evaluator-teacher-readiness.md",
  "inputContract": {
    "artifactKinds": ["tool_result", "response"]
  },
  "policy": {
    "minimumScore": 0.8,
    "checkpointOnFailure": true
  }
}
```

这样做的价值：

1. GeoHelper 内部可以继续本地执行 evaluator
2. 导出到 OpenClaw 时，也能保留 evaluator 语义
3. 评估门控成为 bundle 的一部分，而不是宿主私有 if/else

## 11. Context Engine V2

需要把当前的 context assembly 提升成真正的 context engine。

目标生命周期：

1. `ingest`
   - 摄入新消息、artifact、workspace state、standing orders
2. `retrieve`
   - 检索 thread/workspace/domain/policy memory
3. `assemble`
   - 组装 system、instructions、conversation、artifacts、workspace
4. `compact`
   - 长上下文压缩
5. `afterTurn`
   - 写入记忆、更新摘要、记录 lineage

建议接口：

```ts
interface AgentContextEngine {
  ingest(input: HostTurnInput): Promise<void>;
  assemble(input: ContextAssembleInput): Promise<ContextPacket>;
  compact(input: ContextCompactionInput): Promise<ContextCompactionResult>;
  afterTurn(input: AfterTurnInput): Promise<void>;
}
```

这层要替代“store 上直接拼 context”的思路。

## 12. Memory Model V2

当前 `thread / workspace / domain / policy` 作用域是对的，应该保留，但要补两类信息：

1. `source provenance`
   - 来源消息、来源 artifact、来源 evaluator
2. `promotion rules`
   - 何时从 thread 晋升到 workspace，何时拒绝写入

建议新增字段：

```ts
interface PortableMemoryEntry {
  id: string;
  scope: "thread" | "workspace" | "domain" | "policy";
  scopeId: string;
  key: string;
  value: unknown;
  source: {
    runId?: string;
    artifactId?: string;
    evaluator?: string;
    messageId?: string;
  };
  confidence?: number;
  promotionRule?: "ephemeral" | "promote_to_workspace" | "never_promote";
  createdAt: string;
}
```

## 13. Subagent And Delegation Model

这部分必须彻底改。

当前模型：

1. workflow node 填 `runProfileId`
2. worker 创建 child run
3. 可选等待 child 完成

这只适合 GeoHelper 内部。

V2 需要区分三种 delegation：

1. `native-subagent`
   - 由当前宿主直接派生子 agent session
2. `acp-agent`
   - 通过 ACP 调起外部 agent harness
3. `host-service`
   - 实际上不是 agent，而是宿主服务调用

建议 delegation manifest：

```json
{
  "delegations": [
    {
      "name": "geometry-draft-checker",
      "mode": "native-subagent",
      "agentRef": "geometry-reviewer",
      "awaitCompletion": true
    },
    {
      "name": "general-research",
      "mode": "acp-agent",
      "agentRef": "codex-research",
      "awaitCompletion": true
    }
  ]
}
```

这能自然映射到 OpenClaw 的 native subagent 和 ACP agent 两套体系。

## 14. Approval And Safety Policy

GeoHelper 需要把当前零散的权限、检查点、浏览器工具等待，统一收束成 `approval policy`。

建议 policy 维度：

1. tool approval
2. write approval
3. external delegation approval
4. browser action approval
5. irreversible action approval

结构示例：

```json
{
  "defaultMode": "allow-with-policy",
  "rules": [
    {
      "action": "scene.write",
      "approval": "allow"
    },
    {
      "action": "external.web_access",
      "approval": "checkpoint"
    },
    {
      "action": "delegate.acp-agent",
      "approval": "checkpoint"
    }
  ]
}
```

## 15. Artifact Contract V2

Artifact 需要从“运行产物”升级为“宿主无关的输出契约”。

至少要有：

1. `artifact kind`
2. `semantic role`
3. `contract version`
4. `consumer expectations`
5. `portable payload`

例如几何 agent 的最终输出不应只是 GeoHelper 私有结构，而应包含：

1. 对用户的自然语言说明
2. 对宿主的结构化动作提议
3. 对 evaluator 的可评分证据

## 16. GeoHelper Host Adapter

GeoHelper 宿主层保留，但只能做宿主适配，不再定义 agent 本体。

建议职责：

1. `GeoHelperWorkspaceAdapter`
   - 从现有工作区拿 scene state、thread state、recent artifacts
2. `GeoHelperToolHost`
   - 执行 scene.read_state / scene.apply_command_batch 等宿主工具
3. `GeoHelperApprovalBridge`
   - 把 policy action 转成 checkpoint / UI confirmation
4. `GeoHelperArtifactProjector`
   - 把 portable artifact 投影到当前 UI
5. `GeoHelperBundleLoader`
   - 从 `agents/*` 读取并解析 bundle

## 17. OpenClaw Export Adapter

新增一个导出器，而不是直接硬编码兼容。

建议目标：

1. 读取 GeoHelper V2 bundle
2. 输出 OpenClaw-friendly workspace layout
3. 生成插件或 agent package 元数据
4. 对无法直接迁移的能力输出 compatibility report

建议输出物：

```text
exports/openclaw/geometry-solver/
  agent.json
  workspace/...
  tools/...
  evaluators/...
  export-report.json
```

`export-report.json` 应至少包含：

1. fully portable items
2. host-bound items
3. required OpenClaw capabilities
4. degraded behaviors

## 18. Required Package Refactor

### Keep And Refactor

1. `packages/agent-protocol`
   - 从 runtime-only contract 扩展为 portable bundle contract
2. `packages/agent-context`
   - 升级为 context engine API
3. `packages/agent-memory`
   - 增加 promotion / provenance / compaction 接口
4. `packages/agent-tools`
   - 支持 manifest-based loading
5. `packages/agent-sdk`
   - 从 domain registration 升级为 bundle loading + host wiring

### Add

1. `packages/agent-bundle`
   - spec schema、loader、validator
2. `packages/agent-export-openclaw`
   - exporter、compatibility report
3. `packages/agent-host-geohelper`
   - GeoHelper-specific adapters

### Narrow

1. `packages/agent-domain-geometry`
   - 只保留 geometry domain helper、prompt templates、tool schemas、evaluator helpers
   - 不再承担整个平台 bootstrap

## 19. Data Model Changes

现有 store 表大体可保留，但建议增加两类概念：

1. `agent_bundles`
   - bundle id、version、source、resolved manifest、host binding
2. `host_capability_bindings`
   - capability key 到 GeoHelper 实际 provider 的绑定

可选新增：

1. `standing_order_entries`
2. `context_snapshots`
3. `export_reports`

## 20. Migration Strategy

### Phase 0: Freeze Old Compatibility

1. 停止再扩展旧 agent definition
2. 标记现有 platform bootstrap 为过渡层

### Phase 1: Introduce Bundle Schema

1. 新建 `packages/agent-bundle`
2. 为 geometry solver 写第一份 bundle
3. 保持 runtime 暂时通过 adapter 读取 bundle

### Phase 2: File-Backed Workspace Bootstrap

1. 引入 `AGENTS.md` 等 workspace files
2. prompt assembler 从文件加载而不是硬编码

### Phase 3: Host Capability Binding

1. 工具不再直接绑定 GeoHelper 实现
2. 改为 capability -> host binding

### Phase 4: Delegation Refactor

1. subagent 改成 delegation manifest
2. 支持 `native-subagent` 和 `acp-agent`

### Phase 5: Exporter

1. 增加 OpenClaw exporter
2. 生成 compatibility report

### Phase 6: Cutover

1. control-plane / worker 只接受 portable agent bundle
2. 删除旧 platform bootstrap 入口

## 21. Success Criteria

重构完成后，应该满足以下验证标准：

1. GeoHelper 内部运行一个 agent 时，runtime 只依赖 bundle + host adapter
2. 同一个 agent 可以在不改 prompt 资产的前提下导出到 OpenClaw-friendly layout
3. 工具、评估器、standing orders、memory policy 都能结构化导出
4. child agent delegation 能表达 native 和 ACP 两种模式
5. 几何域不再拥有平台本体定义权

## 22. Non-Goals

这次不追求：

1. 与 OpenClaw 某一版 runtime 的逐字段严格兼容
2. 一次性支持所有 OpenClaw 插件和 provider
3. 先做多租户 SaaS 安全模型
4. 先把所有历史 agent 自动迁移

## 23. Recommendation

推荐直接执行以下路线：

1. 以 `portable bundle` 为新平台中心
2. 保留现有 `control-plane + worker + store` 作为 GeoHelper 宿主 runtime
3. 用 `host capability binding` 隔离 GeoHelper 私有能力
4. 新增 `OpenClaw exporter`，而不是追逐 runtime 级完全兼容

这是唯一同时满足三件事的方案：

1. 不被旧设计拖住
2. 不被 OpenClaw 内部实现绑死
3. 未来 agent 可以真实迁移出去

## 24. Source Notes

本方案的 OpenClaw 对齐方向主要依据官方文档中的这些能力面：

1. Agent loop 与 workspace bootstrap
   - https://docs.openclaw.ai/concepts/agent-loop
2. Agent workspace 文件形态
   - https://docs.openclaw.ai/concepts/agent-workspace
3. Context engine 可替换性
   - https://docs.openclaw.ai/concepts/context-engine
4. Multi-agent routing
   - https://docs.openclaw.ai/concepts/multi-agent
5. ACP agents
   - https://docs.openclaw.ai/tools/acp-agents
6. Plugins
   - https://docs.openclaw.ai/tools/plugin
7. Standing orders
   - https://docs.openclaw.ai/automation/standing-orders

其中“GeoHelper 不应追求 runtime 级一比一兼容，而应追求 portability 级兼容”是基于上述资料做出的架构判断。
