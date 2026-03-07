# Short Landscape Chat Density Design

**Goal:** 修复低高度横屏下聊天面板的输入区过高、消息可视区过小的问题。

## Context

线上 `844×390` 视口已经具备较紧凑的顶部栏，但聊天 surface 内部仍沿用普通 compact chat composer 的高度规则。结果是 `.chat-composer` 占据约 `178px`，`.chat-messages` 只有约 `60px`，空态与后续消息都被压缩到接近不可用。

## Options Considered

1. 继续压缩整个顶部区域
- 优点：实现简单。
- 缺点：已经修过，收益有限，问题主体已转移到 composer。

2. 仅在 `short-viewport + compact-viewport + mobile-surface-chat` 下压缩 composer
- 优点：影响面最小，只作用于真正失效的断面。
- 缺点：需要补一组更细的 CSS 规则。

3. 把 composer 改成浮动悬浮层
- 优点：理论上能释放更多高度。
- 缺点：改动过大，风险高，超出当前问题范围。

## Recommendation

采用方案 2：
- 隐藏短横屏聊天空态上的辅助 hint 文本。
- 缩小 composer 间距、输入壳 padding、按钮尺寸和 textarea 最小高度。
- 收紧 slash menu 的最大高度，避免模板面板在短横屏吃掉大量垂直空间。

## Testing

- 新增 E2E：`844×390` 聊天 surface 下，消息区高度必须保持可读，composer 高度必须受控。
- 继续运行现有 `fullscreen-toggle` 和 `geogebra-mount` 相关回归，避免伤到手机竖屏与普通 compact 布局。
