use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashSet;

use crate::db::error::{AppError, AppResult};

use super::{AiProvider, ModelTurn, ToolCall, ToolSpec, Turn};

const DEFAULT_MODEL: &str = "claude-sonnet-5";
const MESSAGES_URL: &str = "https://api.anthropic.com/v1/messages";
const MODELS_URL: &str = "https://api.anthropic.com/v1/models";
const API_VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 4096;

pub struct Anthropic {
    api_key: String,
    model: String,
    http: reqwest::Client,
}

impl Anthropic {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Self {
            api_key,
            model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            http: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for Anthropic {
    async fn complete(
        &self,
        system: &str,
        turns: &[Turn],
        tools: &[ToolSpec],
    ) -> AppResult<ModelTurn> {
        if self.api_key.is_empty() {
            return Err(AppError::Message("Anthropic API key is not set".into()));
        }

        let response = self
            .http
            .post(MESSAGES_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .json(&build_body(&self.model, system, turns, tools))
            .send()
            .await
            .map_err(|error| AppError::Message(format!("Anthropic request failed: {error}")))?;

        let status = response.status();
        let text = response.text().await.map_err(|error| {
            AppError::Message(format!("Anthropic response read failed: {error}"))
        })?;
        if !status.is_success() {
            return Err(AppError::Message(format!(
                "Anthropic API error {status}: {text}"
            )));
        }

        let parsed: Value = serde_json::from_str(&text)
            .map_err(|error| AppError::Message(format!("Anthropic JSON parse failed: {error}")))?;
        parse_model_turn(&parsed)
    }

    async fn complete_stream(
        &self,
        system: &str,
        turns: &[Turn],
        tools: &[ToolSpec],
        on_delta: &(dyn for<'a> Fn(&'a str) + Send + Sync),
    ) -> AppResult<ModelTurn> {
        if self.api_key.is_empty() {
            return Err(AppError::Message("Anthropic API key is not set".into()));
        }

        let mut body = build_body(&self.model, system, turns, tools);
        body["stream"] = json!(true);
        let response = self
            .http
            .post(MESSAGES_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .json(&body)
            .send()
            .await
            .map_err(|error| AppError::Message(format!("Anthropic request failed: {error}")))?;

        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(AppError::Message(format!(
                "Anthropic API error {status}: {text}"
            )));
        }

        let mut response = response;
        let mut buffer = Vec::new();
        let mut state = StreamState::default();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| AppError::Message(format!("Anthropic stream read failed: {error}")))?
        {
            consume_stream_chunk(&mut buffer, &chunk, &mut state, on_delta)?;
        }
        if !buffer.is_empty() {
            let line = std::str::from_utf8(&buffer).map_err(|error| {
                AppError::Message(format!("Anthropic stream UTF-8 decode failed: {error}"))
            })?;
            process_stream_line(&mut state, line.trim(), on_delta)?;
        }
        state.finish()
    }
}

fn turn_to_message(turn: &Turn) -> Value {
    match turn {
        Turn::User(text) => json!({
            "role": "user",
            "content": [{ "type": "text", "text": text }]
        }),
        Turn::Model(model_turn) => {
            let mut content = Vec::new();
            if let Some(text) = &model_turn.text {
                if !text.is_empty() {
                    content.push(json!({ "type": "text", "text": text }));
                }
            }
            content.extend(model_turn.tool_calls.iter().map(|call| {
                json!({
                    "type": "tool_use",
                    "id": call.id,
                    "name": call.name,
                    "input": call.args,
                })
            }));
            json!({ "role": "assistant", "content": content })
        }
        Turn::ToolResults(results) => {
            let content: Vec<Value> = results
                .iter()
                .map(|result| {
                    json!({
                        "type": "tool_result",
                        "tool_use_id": result.call_id,
                        "content": result.content,
                    })
                })
                .collect();
            json!({ "role": "user", "content": content })
        }
    }
}

fn tool_to_value(tool: &ToolSpec) -> Value {
    json!({
        "name": tool.name,
        "description": tool.description,
        "input_schema": tool.parameters,
    })
}

fn build_body(model: &str, system: &str, turns: &[Turn], tools: &[ToolSpec]) -> Value {
    let mut body = json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": system,
        "messages": turns.iter().map(turn_to_message).collect::<Vec<_>>(),
    });
    if !tools.is_empty() {
        body["tools"] = json!(tools.iter().map(tool_to_value).collect::<Vec<_>>());
        body["tool_choice"] = json!({ "type": "auto" });
    }
    body
}

fn parse_model_turn(response: &Value) -> AppResult<ModelTurn> {
    let mut text = String::new();
    let mut tool_calls = Vec::new();

    if let Some(content) = response.get("content").and_then(Value::as_array) {
        for block in content {
            match block.get("type").and_then(Value::as_str) {
                Some("text") => {
                    if let Some(fragment) = block.get("text").and_then(Value::as_str) {
                        text.push_str(fragment);
                    }
                }
                Some("tool_use") => tool_calls.push(ToolCall {
                    id: block
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    name: block
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    args: block
                        .get("input")
                        .cloned()
                        .unwrap_or(Value::Object(Default::default())),
                }),
                _ => {}
            }
        }
    }

    Ok(ModelTurn {
        text: if text.is_empty() { None } else { Some(text) },
        tool_calls,
    })
}

#[derive(Default)]
struct StreamState {
    text: String,
    blocks: Vec<StreamBlock>,
}

enum StreamBlock {
    Empty,
    Text,
    Tool {
        id: String,
        name: String,
        input: String,
    },
}

impl StreamState {
    fn block_mut(&mut self, index: usize) -> &mut StreamBlock {
        while self.blocks.len() <= index {
            self.blocks.push(StreamBlock::Empty);
        }
        &mut self.blocks[index]
    }

    fn finish(self) -> AppResult<ModelTurn> {
        let mut tool_calls = Vec::new();
        for block in self.blocks {
            let StreamBlock::Tool { id, name, input } = block else {
                continue;
            };
            let args = if input.is_empty() {
                Value::Object(Default::default())
            } else {
                serde_json::from_str(&input).map_err(|error| {
                    AppError::Message(format!(
                        "Anthropic tool input JSON parse failed for {name}: {error}"
                    ))
                })?
            };
            tool_calls.push(ToolCall { id, name, args });
        }
        Ok(ModelTurn {
            text: if self.text.is_empty() {
                None
            } else {
                Some(self.text)
            },
            tool_calls,
        })
    }
}

fn apply_stream_event(
    state: &mut StreamState,
    event: &Value,
    on_delta: &(dyn for<'a> Fn(&'a str) + Send + Sync),
) -> AppResult<()> {
    match event.get("type").and_then(Value::as_str) {
        Some("content_block_start") => {
            let index = event.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
            let block = event.get("content_block").unwrap_or(&Value::Null);
            match block.get("type").and_then(Value::as_str) {
                Some("text") => {
                    *state.block_mut(index) = StreamBlock::Text;
                    if let Some(text) = block.get("text").and_then(Value::as_str) {
                        if !text.is_empty() {
                            state.text.push_str(text);
                            on_delta(text);
                        }
                    }
                }
                Some("tool_use") => {
                    let initial_input = block
                        .get("input")
                        .filter(|value| value.as_object().is_some_and(|map| !map.is_empty()))
                        .map(Value::to_string)
                        .unwrap_or_default();
                    *state.block_mut(index) = StreamBlock::Tool {
                        id: block
                            .get("id")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        name: block
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        input: initial_input,
                    };
                }
                _ => {}
            }
        }
        Some("content_block_delta") => {
            let index = event.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
            let delta = event.get("delta").unwrap_or(&Value::Null);
            match delta.get("type").and_then(Value::as_str) {
                Some("text_delta") => {
                    if let Some(text) = delta.get("text").and_then(Value::as_str) {
                        if !text.is_empty() {
                            state.text.push_str(text);
                            on_delta(text);
                        }
                    }
                }
                Some("input_json_delta") => {
                    if let Some(fragment) = delta.get("partial_json").and_then(Value::as_str) {
                        if let StreamBlock::Tool { input, .. } = state.block_mut(index) {
                            input.push_str(fragment);
                        }
                    }
                }
                _ => {}
            }
        }
        Some("error") => {
            let message = event
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("unknown Anthropic stream error");
            return Err(AppError::Message(format!(
                "Anthropic stream error: {message}"
            )));
        }
        _ => {}
    }
    Ok(())
}

fn process_stream_line(
    state: &mut StreamState,
    line: &str,
    on_delta: &(dyn for<'a> Fn(&'a str) + Send + Sync),
) -> AppResult<()> {
    let Some(data) = line.strip_prefix("data:") else {
        return Ok(());
    };
    let data = data.trim();
    if data.is_empty() || data == "[DONE]" {
        return Ok(());
    }
    let event: Value = serde_json::from_str(data).map_err(|error| {
        AppError::Message(format!("Anthropic stream JSON parse failed: {error}"))
    })?;
    apply_stream_event(state, &event, on_delta)
}

fn consume_stream_chunk(
    buffer: &mut Vec<u8>,
    chunk: &[u8],
    state: &mut StreamState,
    on_delta: &(dyn for<'a> Fn(&'a str) + Send + Sync),
) -> AppResult<()> {
    buffer.extend_from_slice(chunk);
    while let Some(newline) = buffer.iter().position(|byte| *byte == b'\n') {
        let line_bytes: Vec<u8> = buffer.drain(..=newline).collect();
        let line = std::str::from_utf8(&line_bytes[..line_bytes.len() - 1]).map_err(|error| {
            AppError::Message(format!("Anthropic stream UTF-8 decode failed: {error}"))
        })?;
        process_stream_line(state, line.trim(), on_delta)?;
    }
    Ok(())
}

pub async fn list_models(api_key: &str) -> AppResult<Vec<String>> {
    if api_key.is_empty() {
        return Err(AppError::Message("Anthropic API key is not set".into()));
    }

    let response = reqwest::Client::new()
        .get(MODELS_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", API_VERSION)
        .query(&[("limit", "1000")])
        .send()
        .await
        .map_err(|error| AppError::Message(format!("Anthropic request failed: {error}")))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| AppError::Message(format!("Anthropic response read failed: {error}")))?;
    if !status.is_success() {
        return Err(AppError::Message(format!(
            "Anthropic API error {status}: {text}"
        )));
    }

    let parsed: Value = serde_json::from_str(&text)
        .map_err(|error| AppError::Message(format!("Anthropic JSON parse failed: {error}")))?;
    Ok(parse_models(&parsed))
}

fn parse_models(response: &Value) -> Vec<String> {
    let mut seen = HashSet::new();
    response
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|model| model.get("id").and_then(Value::as_str))
        .filter(|id| id.starts_with("claude-"))
        .filter(|id| seen.insert((*id).to_string()))
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        apply_stream_event, consume_stream_chunk, list_models, parse_model_turn, parse_models,
        tool_to_value, turn_to_message, Anthropic, StreamState,
    };
    use crate::ai::{AiProvider, ModelTurn, ToolCall, ToolResult, ToolSpec, Turn};

    #[test]
    fn translates_neutral_turns_to_anthropic_content_blocks() {
        assert_eq!(
            turn_to_message(&Turn::User("Show revenue".into())),
            json!({
                "role": "user",
                "content": [{ "type": "text", "text": "Show revenue" }]
            })
        );

        assert_eq!(
            turn_to_message(&Turn::Model(ModelTurn {
                text: Some("I will query it.".into()),
                tool_calls: vec![ToolCall {
                    id: "toolu_123".into(),
                    name: "run_sql".into(),
                    args: json!({ "sql": "SELECT 1" }),
                }],
            })),
            json!({
                "role": "assistant",
                "content": [
                    { "type": "text", "text": "I will query it." },
                    {
                        "type": "tool_use",
                        "id": "toolu_123",
                        "name": "run_sql",
                        "input": { "sql": "SELECT 1" }
                    }
                ]
            })
        );

        assert_eq!(
            turn_to_message(&Turn::ToolResults(vec![ToolResult {
                call_id: "toolu_123".into(),
                name: "run_sql".into(),
                content: "[{\"total\":42}]".into(),
            }])),
            json!({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "toolu_123",
                    "content": "[{\"total\":42}]"
                }]
            })
        );
    }

    #[test]
    fn translates_tool_parameters_to_anthropic_input_schema() {
        let tool = ToolSpec {
            name: "run_sql".into(),
            description: "Run one read-only query".into(),
            parameters: json!({
                "type": "object",
                "properties": { "sql": { "type": "string" } },
                "required": ["sql"]
            }),
        };

        assert_eq!(
            tool_to_value(&tool),
            json!({
                "name": "run_sql",
                "description": "Run one read-only query",
                "input_schema": {
                    "type": "object",
                    "properties": { "sql": { "type": "string" } },
                    "required": ["sql"]
                }
            })
        );
    }

    #[test]
    fn parses_anthropic_text_and_tool_use_blocks() {
        let response = json!({
            "content": [
                { "type": "text", "text": "Revenue is " },
                { "type": "text", "text": "available." },
                {
                    "type": "tool_use",
                    "id": "toolu_456",
                    "name": "run_sql",
                    "input": { "sql": "SELECT SUM(total_price) FROM orders" }
                }
            ]
        });

        let turn = parse_model_turn(&response).expect("response should parse");

        assert_eq!(turn.text.as_deref(), Some("Revenue is available."));
        assert_eq!(turn.tool_calls.len(), 1);
        assert_eq!(turn.tool_calls[0].id, "toolu_456");
        assert_eq!(turn.tool_calls[0].name, "run_sql");
        assert_eq!(
            turn.tool_calls[0].args,
            json!({ "sql": "SELECT SUM(total_price) FROM orders" })
        );
    }

    #[tokio::test]
    async fn rejects_an_empty_anthropic_key_before_network_access() {
        let provider = Anthropic::new(String::new(), None);

        let error = provider
            .complete("system", &[Turn::User("hello".into())], &[])
            .await
            .err()
            .expect("empty key must fail");

        assert_eq!(error.to_string(), "Anthropic API key is not set");
    }

    #[test]
    fn accumulates_streamed_text_and_partial_tool_input() {
        let emitted = std::sync::Mutex::new(Vec::new());
        let emit = |fragment: &str| emitted.lock().unwrap().push(fragment.to_string());
        let mut state = StreamState::default();

        for event in [
            json!({
                "type": "content_block_start",
                "index": 0,
                "content_block": { "type": "text", "text": "" }
            }),
            json!({
                "type": "content_block_delta",
                "index": 0,
                "delta": { "type": "text_delta", "text": "Hello " }
            }),
            json!({
                "type": "content_block_delta",
                "index": 0,
                "delta": { "type": "text_delta", "text": "world" }
            }),
            json!({
                "type": "content_block_start",
                "index": 1,
                "content_block": {
                    "type": "tool_use",
                    "id": "toolu_stream",
                    "name": "run_sql",
                    "input": {}
                }
            }),
            json!({
                "type": "content_block_delta",
                "index": 1,
                "delta": { "type": "input_json_delta", "partial_json": "{\"sql\":\"SEL" }
            }),
            json!({
                "type": "content_block_delta",
                "index": 1,
                "delta": { "type": "input_json_delta", "partial_json": "ECT 1\"}" }
            }),
        ] {
            apply_stream_event(&mut state, &event, &emit).expect("event should parse");
        }

        let turn = state.finish().expect("stream should finalize");
        assert_eq!(turn.text.as_deref(), Some("Hello world"));
        assert_eq!(turn.tool_calls.len(), 1);
        assert_eq!(turn.tool_calls[0].id, "toolu_stream");
        assert_eq!(turn.tool_calls[0].name, "run_sql");
        assert_eq!(turn.tool_calls[0].args, json!({ "sql": "SELECT 1" }));
        assert_eq!(&*emitted.lock().unwrap(), &["Hello ", "world"]);
    }

    #[test]
    fn surfaces_anthropic_stream_error_events() {
        let mut state = StreamState::default();
        let error = apply_stream_event(
            &mut state,
            &json!({
                "type": "error",
                "error": { "type": "overloaded_error", "message": "Overloaded" }
            }),
            &|_| {},
        )
        .expect_err("error event must fail");

        assert_eq!(error.to_string(), "Anthropic stream error: Overloaded");
    }

    #[test]
    fn preserves_utf8_when_an_http_chunk_splits_a_character() {
        let line = format!(
            "data: {}\n\n",
            json!({
                "type": "content_block_delta",
                "index": 0,
                "delta": { "type": "text_delta", "text": "O‘zbekiston" }
            })
        );
        let bytes = line.as_bytes();
        let character_start = bytes
            .windows(3)
            .position(|window| window == [0xe2, 0x80, 0x98])
            .expect("curly apostrophe must be present");
        let split = character_start + 1;
        let emitted = std::sync::Mutex::new(Vec::new());
        let emit = |fragment: &str| emitted.lock().unwrap().push(fragment.to_string());
        let mut buffer = Vec::new();
        let mut state = StreamState::default();

        consume_stream_chunk(&mut buffer, &bytes[..split], &mut state, &emit)
            .expect("first chunk should buffer");
        consume_stream_chunk(&mut buffer, &bytes[split..], &mut state, &emit)
            .expect("second chunk should complete the event");

        let turn = state.finish().expect("stream should finalize");
        assert_eq!(turn.text.as_deref(), Some("O‘zbekiston"));
        assert_eq!(&*emitted.lock().unwrap(), &["O‘zbekiston"]);
    }

    #[test]
    fn parses_unique_claude_models_in_api_order() {
        let response = json!({
            "data": [
                { "id": "claude-sonnet-5", "type": "model" },
                { "id": "claude-opus-5", "type": "model" },
                { "id": "embedding-model", "type": "model" },
                { "id": "claude-sonnet-5", "type": "model" }
            ]
        });

        assert_eq!(
            parse_models(&response),
            vec!["claude-sonnet-5", "claude-opus-5"]
        );
    }

    #[tokio::test]
    async fn model_discovery_rejects_an_empty_key_before_network_access() {
        let error = list_models("").await.expect_err("empty key must fail");

        assert_eq!(error.to_string(), "Anthropic API key is not set");
    }
}
