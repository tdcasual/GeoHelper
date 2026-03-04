# GeoHelper 设计方案（LLM 驱动 GeoGebra）

- 日期：2026-03-04
- 状态：已评审确认
- 目标：构建可静态部署的 Web 应用，通过 LLM 自动生成并执行 GeoGebra 指令，支持 BYOK 与官方网关双入口。

## 1. 产品目标与范围

### 1.1 产品目标

构建一个“对话式几何工作台”：

1. 用户使用自然语言描述图形或数学任务。
2. LLM 生成结构化 GeoGebra 指令（非原始脚本）。
3. 前端执行指令并在 GeoGebra 中实时渲染。
4. 聊天区可折叠隐藏，实现画布全屏沉浸式查看。

### 1.2 V1 范围（Must Have）

1. NextChat 风格聊天体验与本地优先持久化。
2. 左侧大画布（GeoGebra）+ 右侧聊天区，支持聊天区完全隐藏。
3. 全量能力目标：2D/3D/CAS/概率工具可通过统一指令协议触发。
4. LLM 路由使用 LiteLLM，支持多模型供应商。
5. 双入口：BYOK 与官方网关并列。
6. 官方入口：预设 Token 校验后签发短期会话令牌。
7. 本地持久化 + 导入/导出；云同步延后到 V1.1。

### 1.3 V1 非目标（Not In Scope）

1. 团队多人实时协作。
2. 强制登录账号体系。
3. 完整云端历史同步。

## 2. 总体架构

采用“静态前端 + 独立智能网关”架构。

### 2.1 前端（EdgeOne 静态托管）

职责：

1. 对话 UI、布局状态与本地数据管理。
2. GeoGebra 容器加载、指令执行与场景更新。
3. 模式切换（BYOK / 官方网关）。
4. 导入导出与本地迁移。

特点：

1. 可纯静态部署，符合 NextChat 风格发布方式。
2. 不持有官方模型密钥。
3. 不执行任意脚本，只执行白名单操作。

### 2.2 智能网关（独立部署）

职责：

1. 官方 Token 校验与短期令牌签发。
2. 多代理编排与调用 LiteLLM。
3. 风险控制（限流、配额、黑名单、审计）。
4. 结构化结果返回前端。

特点：

1. 与静态前端解耦，便于独立扩缩容。
2. 可支持多模型、A/B 模型策略与故障降级。

## 3. 多代理系统设计（核心）

### 3.1 角色定义

1. `Orchestrator`：总控，组装上下文并调度各代理。
2. `Intent Agent`：将自然语言转为任务语义包。
3. `Planner Agent`：拆解为可执行几何步骤。
4. `Command Agent`：生成版本化结构化指令。
5. `Verifier Agent`：做 schema 与规则校验。
6. `Repair Agent`：自动修复失败输出并重试。

### 3.2 标准流水线

1. 接收用户输入 + 会话上下文 + 场景快照。
2. Intent 产出目标、约束、数学域、近似容忍。
3. Planner 产出步骤图（依赖关系）。
4. Command 产出 `CommandBatch`。
5. Verifier 检查：
   - JSON schema
   - 操作白名单
   - 参数合法性
   - 依赖图可执行性
6. 失败则 Repair 修复并有限重试。
7. 成功后返回前端执行并回传执行结果。

### 3.3 降级与容错

1. 多代理异常时可降级到单代理路径。
2. 每层独立重试预算，避免无限循环。
3. 重试失败时返回“可解释失败”信息与建议。

## 4. 指令协议（LLM 到 GeoGebra 的安全边界）

### 4.1 顶层结构

`CommandBatch`：

- `version`
- `scene_id`
- `transaction_id`
- `commands[]`
- `post_checks[]`
- `explanations[]`

### 4.2 单条指令字段

- `id`
- `op`
- `args`
- `depends_on`
- `idempotency_key`
- `on_fail`

### 4.3 `op` 白名单（示例）

1. `create_point`
2. `create_line`
3. `create_conic`
4. `set_property`
5. `create_slider`
6. `create_3d_object`
7. `run_cas`
8. `run_probability_tool`

说明：

1. 禁止原始脚本执行接口暴露给 LLM。
2. 高风险操作（CAS/3D/概率）附加参数约束。

## 5. 前端产品与交互设计

### 5.1 布局

1. 默认：左侧大 GeoGebra 画布，右侧聊天区。
2. 聊天区支持完全折叠，画布进入全屏。
3. 顶栏包含模式切换、模型设置、导入导出、场景控制。

### 5.2 核心组件

1. `WorkspaceShell`
2. `CanvasPanel`
3. `ChatPanel`
4. `TopCommandBar`
5. `ModelConfigModal`
6. `ImportExportDialog`

### 5.3 状态管理

1. `ConversationStore`：消息、代理摘要、事务历史。
2. `GeoSceneStore`：对象映射、执行结果、回滚点。
3. `SettingsStore`：UI 偏好、模型配置、模式信息。

## 6. 持久化方案（参考 NextChat）

V1 采用“本地优先 + 可迁移 + 可导出导入”。

### 6.1 存储分层

1. `IndexedDB`：会话正文、执行事务、模板库。
2. `localStorage`：轻量设置（UI 状态、最近模型等）。

### 6.2 版本迁移

1. 数据对象包含 `schema_version`。
2. 启动阶段执行 migration pipeline。

### 6.3 导入导出

统一备份文件：`geochat-backup.json`

包含：

1. `settings_snapshot`
2. `conversations`
3. `templates`
4. `created_at`
5. `app_version`
6. `checksum`

策略：

1. 导入支持“覆盖/合并”。
2. 合并冲突按 `conversation_id + updated_at` 解决。

## 7. 鉴权与安全设计

### 7.1 双入口

1. BYOK：用户自带 endpoint/key。
2. 官方网关：输入预设 Token，后端验证后签发短期令牌。

### 7.2 官方 Token 链路

1. 客户端提交预设 Token。
2. 网关校验成功后签发短期会话令牌。
3. 后续请求携带短期令牌访问代理链路。
4. 令牌到期需重新校验预设 Token。

### 7.3 安全控制

1. 限流与配额（按令牌/IP/设备维度）。
2. Prompt/日志敏感信息脱敏。
3. 白名单指令执行与参数边界检查。
4. 审计日志保留 `trace_id` 便于追踪。

## 8. 错误处理与可观测性

### 8.1 错误分层

1. 输入层：语义不清、约束冲突。
2. 代理层：超时、模型输出格式错。
3. 协议层：schema 或依赖图失败。
4. 执行层：GeoGebra API 运行失败。

### 8.2 前端反馈

1. 用户看到精简可读信息。
2. 开发诊断模式可展开代理步骤摘要。
3. 支持一键重试与回滚到上一个事务。

### 8.3 指标体系

1. `success_rate`
2. `retry_count`
3. `p95_latency`
4. `cost_per_request`
5. `fallback_rate`

## 9. 测试策略

### 9.1 协议契约测试

验证 `CommandBatch` schema、白名单和依赖拓扑。

### 9.2 代理链路回归

基于固定夹具测试 Intent/Planner/Command/Verifier/Repair 的稳定性。

### 9.3 前端 E2E

Playwright 场景：

1. 新建会话与模型切换。
2. 聊天区隐藏/恢复。
3. 指令执行与渲染结果。
4. 导入导出与恢复。
5. BYOK/官方模式切换。

### 9.4 压测

评估不同模型组合下的成功率、时延、成本和重试行为。

## 10. 里程碑与发布门槛

### 10.1 里程碑

1. `M0`：工程骨架 + EdgeOne 静态部署打通。
2. `M1`：单代理闭环（输入到渲染）。
3. `M2`：多代理编排 + 修复链路。
4. `M3`：NextChat 风格 UI + 本地持久化 + 导入导出。
5. `M4`：官方 Token 网关 + 可观测性 + Beta 发布。

### 10.2 发布门槛（建议）

1. 核心场景成功率 >= 95%。
2. P95 端到端延迟 <= 8 秒。
3. 严重错误率 < 1%。
4. 前端崩溃率 < 0.3%。

## 11. 已确认决策清单

1. 部署：腾讯 EdgeOne（前端静态）。
2. LLM：LiteLLM，双模式（BYOK + 官方网关）。
3. 官方模式：预设 Token 校验后签发短期令牌。
4. 指令：结构化 JSON 指令，前端白名单执行。
5. 能力范围：全量（2D/3D/CAS/概率）。
6. 持久化：本地优先 + 导入导出，云同步延期。
7. 系统路线：多代理编排（非单代理、非原始脚本）。

## 12. 下一步（实施准备）

1. 建立技术选型 RFC（前端框架、状态库、网关实现语言）。
2. 输出 API 契约文档（含错误码与鉴权流程）。
3. 先落地 M0 与 M1 的最小可运行样板。
4. 建立标准测试夹具库（几何、函数、CAS、3D、概率）。
