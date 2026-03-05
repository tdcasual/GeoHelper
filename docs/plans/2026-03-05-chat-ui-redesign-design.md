# GeoHelper Chat UI Redesign Design (Desktop/Tablet/Mobile)

Date: 2026-03-05  
Status: Validated (brainstorming complete)

## 1. Goals

This redesign focuses on modernizing chat UI and interaction quality across desktop, tablet, and mobile, aligned with current product patterns from ChatGPT, NextChat, and next-ai-draw-io.

Confirmed decisions:

1. Default state: chat panel visible, history hidden.
2. History interaction: drawer mode, push-layout behavior (not overlay), resizable width.
3. Composer interaction: slash command (`/`) is the primary entry; additional actions are exposed in a ChatGPT-style `+` menu.
4. Compatibility constraints: no backward compatibility requirement for legacy browsers.

## 2. Current Problems

1. Input is a simple one-line field with template select; no modern composer structure.
2. Conversation history is always visible in chat area and cannot be independently hidden.
3. Responsive behavior is coarse (single breakpoint), with no tailored tablet/mobile interaction model.
4. Top bar action density is high, reducing focus on message flow.

## 3. Target UX Model

### 3.1 Chat + History Layout

1. `chatVisible=true` by default.
2. `historyDrawerVisible=false` by default.
3. Desktop/tablet: history opens from left of chat area and pushes message/composer area right.
4. Mobile: history becomes a bottom sheet that pushes message list upward.
5. History drawer width is resizable (desktop/tablet), with persisted width and min/max clamp.

### 3.2 Composer Model

Composer is rebuilt into three layers:

1. Attachment/action layer (`+` menu and inline quick actions).
2. Multi-line adaptive text area (2-10 lines, Enter to send, Shift+Enter newline).
3. Send control/status layer (send/stop, optional counters, model hint).

Template behavior:

1. Primary entry via `/` commands.
2. Optional discovery entry via `+` menu.
3. Template apply mode supports insert-at-caret by default; replace-full-text as explicit action.

### 3.3 Slash Command System

`/` opens a command palette with grouped actions:

1. Templates (`/tpl ...`)
2. Diagram operations
3. Context operations
4. Session operations

Rules:

1. Command execution does not auto-send except explicit `/send`.
2. Command failures keep draft unchanged.
3. Every `+` action has a corresponding slash alias.

## 4. Component Architecture

New/updated components:

1. `HistoryDrawer`
2. `HistoryResizer`
3. `ChatComposer`
4. `SlashCommandPalette`
5. `PlusMenu`

State split:

1. Global persisted state: `chatVisible`, `historyDrawerVisible`, `historyDrawerWidth`, `draftByConversationId`.
2. Local ephemeral state: command highlight index, transient menu state, IME and key handling internals.

## 5. Data Flow

1. User types `/` -> command palette opens -> filtered actions -> selection applies transform to draft or UI state.
2. User opens `+` menu -> selects action -> executes same action registry as slash commands.
3. History drawer open/close and width resize update UI store and persist to local storage + IndexedDB.
4. On conversation switch, draft restores from `draftByConversationId`.

## 6. Error Handling

1. Command parse/param errors: toast feedback, no draft loss.
2. Template missing/invalid: graceful fallback with localized error message.
3. File/URL action failure (from `+`): scoped error toast and no composer reset.
4. Invalid history width from storage: reset to bounded default.

## 7. Testing Strategy

### 7.1 Unit tests

1. Default visibility state (`chat open`, `history closed`).
2. History width clamp and persistence.
3. Slash command parsing and action dispatch.
4. Draft restoration per conversation.

### 7.2 E2E tests (desktop/tablet/mobile viewports)

1. History drawer open/close and resize behavior.
2. Slash command navigation (keyboard and IME-safe enter behavior).
3. `+` menu action parity with slash commands.
4. Composer send/stop/streaming transitions.

### 7.3 Regression

1. Message send flow.
2. Conversation switching.
3. Template insertion behavior.
4. Existing scene rollback/clear controls.

## 8. Phased Delivery

1. Phase 1: history drawer state model + default hidden + resizable shell.
2. Phase 2: new composer + slash command palette.
3. Phase 3: `+` menu integration and action unification.
4. Phase 4: responsive polish + full E2E matrix.

## 9. Implementation Notes

1. Fix current runtime issue before visual verification: remove direct `process.env` access in browser path and rely on `import.meta.env`.
2. Use modern CSS features directly (`dvh`, `:has`, container query where needed) per non-compatibility requirement.
3. Keep action registry single-source to avoid divergence between slash and `+` entry points.
