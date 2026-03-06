# GeoHelper Composer Vision Upload + Settings Center Design

- Date: 2026-03-06
- Status: validated via brainstorming

## 1. Goal

Refine the chat composer and settings experience so the product feels closer to ChatGPT for message entry and closer to NextChat for configuration management.

This design replaces the current toolbar-like `+` action placement with an input-anchored attachment trigger, adds image upload as first-class chat attachments for multimodal models, and upgrades the current right-side settings drawer into a modal settings center better suited for complex configuration.

## 2. Product Decisions

Validated decisions:

1. The composer keeps `/` slash commands as the primary command entry.
2. The `+` action moves into the composer, aligned with the left side of the input area in a ChatGPT-like pattern.
3. The first shipped `+` capability is image upload for chat attachments.
4. Image upload is attachment-oriented, not workspace-asset-oriented.
5. Initial scope supports up to 4 images per message.
6. Initial scope supports file picker, paste, and drag/drop.
7. Initial scope supports local preview and removal, but not crop/edit.
8. Settings move from a side drawer to a centered modal settings center.
9. High-frequency controls remain on the main surface; low-frequency or advanced controls move into the settings center.

## 3. Why the User Suggestions Are Reasonable

### 3.1 Composer `+` Placement

The current composer places `+` above the text area as part of a toolbar. That is functionally acceptable but visually detached from the message input flow. Moving the trigger into the input container is reasonable because it improves affordance, reduces pointer travel, and aligns with user expectations formed by modern chat products.

Adding image upload behind the same trigger is also reasonable, but it must be treated as a data-model and runtime capability change rather than a cosmetic UI tweak. The existing chat pipeline is text-only, so image support requires message schema, validation, preview, and runtime transport updates.

### 3.2 Settings Container

The current settings experience already behaves like a heavy configuration center: runtime profiles, BYOK and Official presets, per-session overrides, experiment flags, backup, secret clearing, and debug logs. In that context, a right-side drawer is no longer the ideal container because it encourages long vertical scrolling and makes section switching cumbersome.

A modal settings center with left navigation and right content pane is a better fit. It preserves focus, gives clearer information architecture, and supports future growth without turning the UI into one oversized form.

## 4. High-Frequency Controls on Main Surface

The main surface should keep only the controls that directly affect active chatting:

1. Mode switcher: `BYOK / Official`
2. Current model or preset quick switcher
3. Official login state and relogin entry

The following move fully into settings:

1. Runtime profile management
2. Endpoint and API key editing
3. Temperature, max tokens, timeout, retry defaults
4. Per-conversation override editing
5. Experiment flags
6. Backup/import/export actions
7. Secret clearing and debug log management

This split keeps the top bar lightweight while preserving access to advanced controls.

## 5. Target UX

### 5.1 Composer

The composer becomes a unified message-entry surface with four layers:

1. Inline left-side `+` trigger inside the composer shell
2. Text area for multi-line prompt input
3. Attachment tray above or inside the composer body for selected images
4. Send/status area for send action, loading state, and capability hints

Interaction rules:

1. Clicking `+` opens a compact action menu anchored to the composer.
2. The first menu item is `Upload image`.
3. Uploaded images appear as removable thumbnails before send.
4. Sending submits text and image attachments together as a single message transaction.
5. Slash commands remain available and should coexist with attachments.
6. If current capabilities do not support vision input, image upload remains visible but disabled with an explanatory hint.

### 5.2 Settings Center

The settings UI becomes a centered modal with stable internal navigation:

1. Fixed header: title, optional search/filter later, close button
2. Left navigation rail
3. Right content pane with grouped cards
4. Footer or final section for destructive actions

Recommended categories:

1. General
2. Models & Presets
3. Current Session
4. Experiments
5. Data & Security

This structure follows user decision order instead of raw technical ownership.

## 6. Component Architecture

### 6.1 New / Updated Composer Components

1. `ChatComposer`
2. `ImageUploadTrigger`
3. `AttachmentTray`
4. `CapabilityHint`
5. Existing slash menu componentry, either extracted or retained behind `ChatComposer`

### 6.2 New / Updated Settings Components

1. `SettingsModal` replacing `SettingsDrawer`
2. `SettingsSidebarNav`
3. `SettingsContentPane`
4. Reused settings form sections, reorganized by category

### 6.3 Shared Capability Layer

Add a unified capability resolver that derives UI and runtime-facing capabilities from:

1. selected mode
2. selected preset
3. selected runtime profile
4. known runtime capabilities

Initial derived capabilities should include at least:

1. `supportsOfficialAuth`
2. `supportsVision`
3. `supportsAgentSteps`

## 7. State Model

### 7.1 Draft State

Upgrade per-conversation draft state from plain text to structured draft state:

```ts
type ComposerDraft = {
  text: string;
  attachments: ImageAttachmentDraft[];
};
```

Each conversation stores its own pending text and pending attachments so switching conversations does not lose in-progress work.

### 7.2 Message State

Extend chat messages from text-only payloads to structured content:

```ts
type ChatAttachment = {
  id: string;
  kind: "image";
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string;
  transportPayload: string;
};
```

Initial implementation only supports image attachments, but the structure should be generic enough for future file types.

### 7.3 Settings UI State

Replace `drawerOpen` with modal-oriented UI state, such as:

1. `settingsOpen`
2. `activeSettingsSection`
3. optional per-section dirty state

Unsaved local form state should survive internal section switching.

## 8. Data Flow

### 8.1 Composer Send Flow

1. User types text and/or adds images.
2. Composer validates count, type, size, and capability support.
3. Valid attachments are converted to previewable local draft items.
4. On send, text plus attachments are passed into `chat-store` as one send request.
5. Runtime request builder converts attachments into multimodal-compatible payload format.
6. Assistant response is appended as usual.

### 8.2 Capability Flow

1. Active mode, preset, and runtime profile are resolved.
2. Capability resolver derives the supported feature set.
3. Composer and settings consume the same capability snapshot.
4. UI disables unsupported actions before send.

### 8.3 Settings Flow

1. User opens modal settings center.
2. User navigates by section without closing the modal.
3. Each section edits a scoped form model.
4. Save operations update the central settings store.
5. Destructive actions require explicit confirmation.

## 9. Validation Rules

Initial attachment validation rules:

1. Maximum 4 images per message
2. Accept image MIME types only
3. Reject files above product-defined size limit
4. Reject upload if current capability snapshot does not support vision input
5. Preserve text draft if any attachment fails validation

Settings validation rules:

1. Section changes do not discard unsaved inputs silently
2. Dangerous actions require confirmation
3. Invalid numeric settings remain localized to their section and do not corrupt persisted state

## 10. Error Handling

Composer errors are split into three stages:

1. Pre-select errors: invalid type, too many files, size too large
2. Post-select errors: preview generation failure or corrupt image data
3. Send-time errors: unsupported model/runtime, request serialization failure, backend rejection

Behavior rules:

1. Never clear the text draft on attachment failure
2. Never silently drop attachments
3. Show localized, inline feedback close to the composer
4. Allow users to remove only the failed attachment and retry

Settings behavior rules:

1. Internal section switching should not feel destructive
2. Backup import, secret clearing, and log clearing must use confirmation gates

## 11. Testing Strategy

### 11.1 Unit Tests

1. Capability resolver outputs for different mode/preset/runtime combinations
2. Attachment validation rules
3. Per-conversation structured draft restore
4. Settings section switching and dirty-state retention

### 11.2 Component / E2E Tests

1. `+` menu opens from inside composer
2. File picker image selection shows thumbnails
3. Paste and drag/drop add images correctly
4. Removing a thumbnail updates draft state
5. Unsupported vision capability disables upload action with clear hint
6. Settings modal opens, navigates sections, and renders grouped content

### 11.3 Regression Tests

1. Plain text send remains unchanged
2. Slash command interaction remains intact
3. BYOK / Official switching still works
4. Backup, import/export, and security actions remain functional after modal migration

## 12. Delivery Plan

Phase 1: Replace drawer with modal settings center and reorganize sections.

Phase 2: Refactor composer layout and move `+` into the input container.

Phase 3: Add image attachment draft state, preview, removal, paste, and drag/drop.

Phase 4: Extend runtime request path for multimodal image messages and complete E2E coverage.

## 13. Non-Goals for First Release

1. Image crop/edit tools
2. Workspace asset library
3. Non-image attachments
4. Multiple attachment types in one message
5. Deep search inside settings center

## 14. Implementation Readiness

This design is ready to convert into an implementation plan. The next step should define file-level changes, state migrations, tests, and rollout order for the modal settings migration and multimodal composer pipeline.
