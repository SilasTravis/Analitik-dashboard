# Claude Provider Design

## Goal

Add Anthropic Claude as a complete third AI provider in the existing Settings and AI Scanner flow. Users configure a direct Anthropic API key, select a Claude model, and use the same streamed analytics and read-only SQL tool workflow already available through Gemini and OpenAI.

## Scope

- Add one provider id, `anthropic`, labeled `Anthropic Claude` in the shared frontend provider catalog.
- Use a direct Anthropic API key created in the Anthropic Console.
- Default new Claude configurations to `claude-sonnet-5` and retain a short curated fallback model list when live discovery is unavailable.
- Preserve the existing single-provider settings record, encrypted device-local API-key storage, provider-switch key requirement, and public masked settings contract.
- Preserve the existing Gemini and OpenAI behavior and all unrelated user changes in the checkout.
- Do not add AWS Bedrock, Google Vertex, custom base URLs, multiple saved provider keys, or Anthropic SDK dependencies.

## Backend architecture

Create `src-tauri/src/ai/anthropic.rs` as a native implementation of the existing `AiProvider` trait. The adapter calls the Anthropic Messages API at `POST https://api.anthropic.com/v1/messages` and authenticates with `x-api-key` plus `anthropic-version: 2023-06-01`.

The adapter translates neutral conversation values as follows:

- `Turn::User` becomes an Anthropic `user` message with a text content block.
- `Turn::Model` becomes an `assistant` message containing optional text blocks followed by `tool_use` blocks with the original call ids, names, and JSON inputs.
- `Turn::ToolResults` becomes a `user` message containing `tool_result` blocks correlated through `tool_use_id`.
- `ToolSpec` becomes an Anthropic client-tool declaration using `input_schema`.

Requests include the existing system prompt as the top-level `system` field, a bounded `max_tokens` value of 4096, the configured model, translated messages, and tool declarations when tools are present.

The non-streaming response parser combines all text blocks and converts every `tool_use` content block to the neutral `ToolCall` shape. The streaming parser consumes Anthropic server-sent events, emits `text_delta` fragments immediately, and accumulates `input_json_delta` fragments by content-block index until each tool call can be parsed.

Model discovery calls `GET https://api.anthropic.com/v1/models?limit=1000` with the same authentication headers, extracts Claude model ids from `data`, preserves the API's newest-first ordering, and removes duplicates.

The backend provider factory and `list_ai_models` command route `anthropic` to the new adapter. Existing encrypted settings serialization remains compatible because provider ids and model names are already stored as strings.

## Frontend behavior

Extend the existing `AI_PROVIDERS` catalog with:

- id: `anthropic`
- label: `Anthropic Claude`
- default model: `claude-sonnet-5`
- fallback models: `claude-sonnet-5`, `claude-opus-5`, `claude-opus-4-8`, and `claude-haiku-4-5`
- key destination: `https://console.anthropic.com/settings/keys`
- key hint: `Anthropic Console`

The existing settings card supplies the provider selector, model selector, refresh action, API-key visibility control, provider-switch warning, save behavior, masked summary, and encrypted-storage explanation without provider-specific component changes.

## Errors and security

- Reject empty Claude API keys before network calls.
- Prefix transport, response-read, HTTP-status, JSON-parse, and stream errors with `Anthropic` so the active provider is clear.
- Never log, serialize into public settings, or include the API key in error messages.
- Ignore unknown streaming event types for forward compatibility while surfacing explicit Anthropic stream error events.
- Keep the existing read-only SQL validation, transaction timeout, row cap, and tool-round cap unchanged.

## Verification

- Rust unit tests cover user/model/tool-result message translation, tool declaration shape, non-streamed text and tool-call parsing, streamed text and partial tool-input accumulation, and model-list parsing.
- A frontend provider-catalog test proves the Claude id, label, default, fallbacks, and key destination are exposed without changing existing providers.
- Run the targeted frontend test and targeted Rust tests first, then all frontend tests, TypeScript checks, the production frontend build, all non-ignored Rust tests, scoped Rust formatting, and `git diff --check`.
- Live Anthropic validation requires a user-supplied API key and is reported separately when unavailable.
