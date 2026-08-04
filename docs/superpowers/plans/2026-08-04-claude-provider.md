# Claude Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct Anthropic Claude configuration and native AI Scanner support alongside Gemini and OpenAI.

**Architecture:** Extend the existing frontend provider catalog and Rust `AiProvider` abstraction. A focused Anthropic adapter owns Messages API serialization, response/SSE parsing, and model discovery; the existing settings storage, AI orchestration, SQL guard, and UI remain provider-neutral.

**Tech Stack:** React 18, TypeScript 5.6, Node test runner, Tauri 2, Rust 2021, reqwest 0.12, serde_json.

## Global Constraints

- Provider id is exactly `anthropic` and the user-facing label is exactly `Anthropic Claude`.
- Direct Anthropic API only; do not add Bedrock, Vertex, gateways, or custom base URLs.
- Default model is `claude-sonnet-5`.
- Preserve the existing encrypted single-provider settings format and require a new key when switching providers.
- Preserve all existing Gemini, OpenAI, SQL safety, and unrelated checkout behavior.
- Never expose the Anthropic API key through logs, public settings, or errors.
- Preserve pre-existing uncommitted formatting and generated-bundle changes.

---

### Task 1: Frontend Claude provider catalog

**Files:**
- Create: `tests/ai-providers.test.mjs`
- Modify: `src/entities/ai/model/providers.ts`

**Interfaces:**
- Consumes: existing `AiProviderInfo` and `AI_PROVIDERS` catalog contract.
- Produces: `AiProviderId = "gemini" | "openai" | "anthropic"` and an Anthropic catalog entry consumed unchanged by `AiSettingsCard`.

- [ ] **Step 1: Write the failing catalog behavior test**

Use the existing TypeScript transpile helper pattern to import `providers.ts`. Assert that `getProvider("anthropic")` returns this literal object:

```js
{
  id: "anthropic",
  label: "Anthropic Claude",
  defaultModel: "claude-sonnet-5",
  fallbackModels: [
    "claude-sonnet-5",
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-haiku-4-5",
  ],
  keyUrl: "https://console.anthropic.com/settings/keys",
  keyHint: "Anthropic Console",
}
```

Also assert that the provider ids remain `['gemini', 'openai', 'anthropic']` so the change catches accidental replacement of existing providers.

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node --test tests/ai-providers.test.mjs`

Expected: FAIL because `getProvider("anthropic")` falls back to Gemini and the provider list contains only Gemini and OpenAI.

- [ ] **Step 3: Add the minimal catalog entry**

Extend `AiProviderId` and append the exact Anthropic object above to `AI_PROVIDERS`.

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `node --test tests/ai-providers.test.mjs`

Expected: PASS.

### Task 2: Anthropic message and tool adapter

**Files:**
- Create: `src-tauri/src/ai/anthropic.rs`

**Interfaces:**
- Consumes: `AiProvider`, `Turn`, `ModelTurn`, `ToolCall`, `ToolResult`, and `ToolSpec` from `src-tauri/src/ai/mod.rs`.
- Produces: `pub struct Anthropic`, `Anthropic::new(api_key: String, model: Option<String>)`, `impl AiProvider for Anthropic`, and private pure request/response conversion helpers.

- [ ] **Step 1: Write failing Rust tests for neutral-turn conversion**

Add unit tests inside `anthropic.rs` proving:

```rust
Turn::User("Show revenue".into())
```

becomes a `user` message with one `text` block; a `ModelTurn` with text and a `run_sql` call becomes an `assistant` message with `text` then `tool_use`; and a `ToolResult` becomes a `user` message with a `tool_result` block whose `tool_use_id` matches the original call id.

Add a tool-declaration test proving `ToolSpec.parameters` is sent as `input_schema`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cargo test ai::anthropic::tests:: --manifest-path src-tauri/Cargo.toml`

Expected: compilation/test failure because the conversion helpers are not implemented.

- [ ] **Step 3: Implement minimal request conversion**

Define constants:

```rust
const DEFAULT_MODEL: &str = "claude-sonnet-5";
const MESSAGES_URL: &str = "https://api.anthropic.com/v1/messages";
const MODELS_URL: &str = "https://api.anthropic.com/v1/models";
const API_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 4096;
```

Implement `turn_to_message`, `tool_to_value`, and `build_body`. The body has `model`, `max_tokens`, `system`, `messages`, and optional `tools` plus `tool_choice: {"type":"auto"}`.

- [ ] **Step 4: Implement non-streaming response parsing test-first**

Add a failing test using a literal Anthropic response containing two text blocks and one `tool_use` block. Expect concatenated text and a neutral `ToolCall` with the literal id, name, and input object. Then implement `parse_model_turn(&Value) -> AppResult<ModelTurn>` and rerun the focused tests to GREEN.

- [ ] **Step 5: Implement the non-streaming HTTP call**

Implement `Anthropic::complete` with early empty-key rejection, `x-api-key`, `anthropic-version`, JSON body, provider-prefixed transport/status/read/parse errors, and `parse_model_turn`.

### Task 3: Anthropic streaming and model discovery

**Files:**
- Modify: `src-tauri/src/ai/anthropic.rs`

**Interfaces:**
- Consumes: reqwest response chunks and Anthropic SSE `data:` JSON events.
- Produces: `Anthropic::complete_stream` and `pub async fn list_models(api_key: &str) -> AppResult<Vec<String>>`.

- [ ] **Step 1: Write failing SSE accumulation tests**

Test a pure `apply_stream_event` helper with literal events for:

- `content_block_start` text and `text_delta` fragments producing `Hello world` and two emitted deltas.
- `content_block_start` tool use plus two `input_json_delta` fragments producing `{"sql":"SELECT 1"}` for the original tool id/name.
- an Anthropic `error` event returning a provider-prefixed error.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cargo test ai::anthropic::tests:: --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because stream state and event application are missing.

- [ ] **Step 3: Implement streaming**

Add indexed stream-block state for text and tool calls, process complete SSE lines from a chunk buffer, ignore unknown events, surface explicit error events, emit each text delta through `on_delta`, and finalize the state into `ModelTurn` after the HTTP stream ends.

- [ ] **Step 4: Write failing model-list parsing tests**

Pass a literal `data` array containing Claude ids, a non-Claude id, and a duplicate. Expect only unique `claude-` ids in first-seen order.

- [ ] **Step 5: Implement model discovery and verify GREEN**

Implement `parse_models` and `list_models` using `GET /v1/models?limit=1000`, direct Anthropic headers, empty-key rejection, provider-prefixed errors, and the pure parser. Run the focused tests and expect PASS.

### Task 4: Route Anthropic through existing application contracts

**Files:**
- Modify: `src-tauri/src/ai/mod.rs`
- Modify: `src-tauri/src/commands/ai.rs`

**Interfaces:**
- Consumes: `anthropic::Anthropic::new` and `anthropic::list_models`.
- Produces: provider construction and live-model routing for the `anthropic` id.

- [ ] **Step 1: Write failing provider-routing tests**

Construct `AiSettings` values with provider ids `anthropic` and `invalid`. Assert that `build_provider` accepts the Anthropic settings without network access and that the invalid settings return `unknown AI provider: invalid`.

- [ ] **Step 2: Run the focused routing tests and verify RED**

Run: `cargo test ai::tests:: --manifest-path src-tauri/Cargo.toml`.

Expected: FAIL because `anthropic` is not routed.

- [ ] **Step 3: Add minimal routing**

Declare `pub mod anthropic`, add the `anthropic` factory branch with the saved key/model, and add the `anthropic` list-model branch in `commands/ai.rs`.

- [ ] **Step 4: Run focused routing and Anthropic tests to GREEN**

Run: `cargo test ai::anthropic::tests:: --manifest-path src-tauri/Cargo.toml` followed by `cargo test ai::tests:: --manifest-path src-tauri/Cargo.toml`.

Expected: PASS.

### Task 5: Full verification and handoff

**Files:**
- Verify all files above plus existing user changes without modifying generated release bundles.

**Interfaces:**
- Consumes: project test/build scripts and Rust toolchain.
- Produces: fresh evidence for the complete Claude provider integration.

- [ ] **Step 1: Format only Rust source**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml`.

The checkout already contains full-workspace Rust formatting changes. Preserve that existing diff and report the boundary.

- [ ] **Step 2: Run frontend verification**

Run, in order:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Run Rust verification**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all non-ignored Rust tests exit 0.

- [ ] **Step 4: Inspect scope and whitespace**

Run:

```bash
git diff --check
git status --short
git diff -- src/entities/ai/model/providers.ts tests/ai-providers.test.mjs src-tauri/src/ai/anthropic.rs src-tauri/src/ai/mod.rs src-tauri/src/commands/ai.rs docs/superpowers/plans/2026-08-04-claude-provider.md
```

Confirm the diff matches the specification and that pre-existing generated-bundle changes remain untouched.

- [ ] **Step 5: Report live-validation boundary**

State explicitly whether a real Anthropic key was available. If not, report that HTTP authentication, live model discovery, and an end-to-end Claude Scanner response were not executed against Anthropic, while distinguishing that from local automated verification.
