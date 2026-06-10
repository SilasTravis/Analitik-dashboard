use async_trait::async_trait;
use serde_json::{json, Value};

use crate::db::error::{AppError, AppResult};

use super::{AiProvider, ModelTurn, ToolCall, ToolSpec, Turn};

const DEFAULT_MODEL: &str = "gpt-4o-mini";
const CHAT_URL: &str = "https://api.openai.com/v1/chat/completions";
const MODELS_URL: &str = "https://api.openai.com/v1/models";

pub struct OpenAi {
    api_key: String,
    model: String,
    http: reqwest::Client,
}

impl OpenAi {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        OpenAi {
            api_key,
            model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            http: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for OpenAi {
    async fn complete(
        &self,
        system: &str,
        turns: &[Turn],
        tools: &[ToolSpec],
    ) -> AppResult<ModelTurn> {
        if self.api_key.is_empty() {
            return Err(AppError::Message("OpenAI API key is not set".into()));
        }

        let mut messages = vec![json!({ "role": "system", "content": system })];
        for turn in turns {
            append_turn(&mut messages, turn);
        }

        let mut body = json!({
            "model": self.model,
            "messages": messages,
        });

        if !tools.is_empty() {
            let decls: Vec<Value> = tools
                .iter()
                .map(|t| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters,
                        }
                    })
                })
                .collect();
            body["tools"] = json!(decls);
            body["tool_choice"] = json!("auto");
        }

        let resp = self
            .http
            .post(CHAT_URL)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Message(format!("OpenAI request failed: {e}")))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| AppError::Message(format!("OpenAI response read failed: {e}")))?;

        if !status.is_success() {
            return Err(AppError::Message(format!("OpenAI API error {status}: {text}")));
        }

        let parsed: Value = serde_json::from_str(&text)
            .map_err(|e| AppError::Message(format!("OpenAI JSON parse failed: {e}")))?;
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
            return Err(AppError::Message("OpenAI API key is not set".into()));
        }

        let mut messages = vec![json!({ "role": "system", "content": system })];
        for turn in turns {
            append_turn(&mut messages, turn);
        }

        let mut body = json!({
            "model": self.model,
            "messages": messages,
            "stream": true,
        });

        if !tools.is_empty() {
            let decls: Vec<Value> = tools
                .iter()
                .map(|t| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.parameters,
                        }
                    })
                })
                .collect();
            body["tools"] = json!(decls);
            body["tool_choice"] = json!("auto");
        }

        let resp = self
            .http
            .post(CHAT_URL)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Message(format!("OpenAI request failed: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Message(format!("OpenAI API error {status}: {text}")));
        }

        let mut resp = resp;
        let mut buf = String::new();
        let mut text = String::new();
        // Accumulate streamed tool_calls keyed by their `index`.
        let mut tool_acc: Vec<ToolCallAcc> = Vec::new();

        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| AppError::Message(format!("OpenAI stream read failed: {e}")))?
        {
            buf.push_str(&String::from_utf8_lossy(&chunk));
            // Process complete lines; keep any trailing partial line in `buf`.
            while let Some(nl) = buf.find('\n') {
                let line = buf[..nl].trim().to_string();
                buf.drain(..=nl);
                let Some(data) = line.strip_prefix("data:") else {
                    continue;
                };
                let data = data.trim();
                if data == "[DONE]" {
                    continue;
                }
                let Ok(event) = serde_json::from_str::<Value>(data) else {
                    continue;
                };
                let Some(delta) = event.pointer("/choices/0/delta") else {
                    continue;
                };

                if let Some(content) = delta.get("content").and_then(Value::as_str) {
                    if !content.is_empty() {
                        text.push_str(content);
                        on_delta(content);
                    }
                }

                if let Some(calls) = delta.get("tool_calls").and_then(Value::as_array) {
                    for call in calls {
                        let idx = call.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                        while tool_acc.len() <= idx {
                            tool_acc.push(ToolCallAcc::default());
                        }
                        let acc = &mut tool_acc[idx];
                        if let Some(id) = call.get("id").and_then(Value::as_str) {
                            acc.id = id.to_string();
                        }
                        let func = call.get("function");
                        if let Some(name) = func.and_then(|f| f.get("name")).and_then(Value::as_str) {
                            acc.name.push_str(name);
                        }
                        if let Some(args) =
                            func.and_then(|f| f.get("arguments")).and_then(Value::as_str)
                        {
                            acc.args.push_str(args);
                        }
                    }
                }
            }
        }

        let tool_calls = tool_acc
            .into_iter()
            .filter(|a| !a.name.is_empty())
            .map(|a| ToolCall {
                id: a.id,
                name: a.name,
                args: serde_json::from_str(&a.args).unwrap_or(Value::Object(Default::default())),
            })
            .collect();

        Ok(ModelTurn {
            text: if text.is_empty() { None } else { Some(text) },
            tool_calls,
        })
    }
}

#[derive(Default)]
struct ToolCallAcc {
    id: String,
    name: String,
    args: String,
}

/// Fetch chat-capable OpenAI model ids.
pub async fn list_models(api_key: &str) -> AppResult<Vec<String>> {
    if api_key.is_empty() {
        return Err(AppError::Message("OpenAI API key is not set".into()));
    }
    let http = reqwest::Client::new();
    let resp = http
        .get(MODELS_URL)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|e| AppError::Message(format!("OpenAI request failed: {e}")))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| AppError::Message(format!("OpenAI response read failed: {e}")))?;
    if !status.is_success() {
        return Err(AppError::Message(format!("OpenAI API error {status}: {text}")));
    }

    let parsed: Value = serde_json::from_str(&text)
        .map_err(|e| AppError::Message(format!("OpenAI JSON parse failed: {e}")))?;

    let mut out = Vec::new();
    if let Some(data) = parsed.get("data").and_then(Value::as_array) {
        for m in data {
            if let Some(id) = m.get("id").and_then(Value::as_str) {
                if is_chat_model(id) {
                    out.push(id.to_string());
                }
            }
        }
    }
    out.sort();
    out.dedup();
    Ok(out)
}

/// Keep general-purpose chat/reasoning models; drop audio/image/embedding/etc.
fn is_chat_model(id: &str) -> bool {
    let is_family = id.starts_with("gpt-")
        || id.starts_with("chatgpt")
        || id.starts_with("o1")
        || id.starts_with("o3")
        || id.starts_with("o4");
    if !is_family {
        return false;
    }
    const EXCLUDE: [&str; 9] = [
        "embedding",
        "whisper",
        "tts",
        "audio",
        "realtime",
        "image",
        "dall-e",
        "moderation",
        "transcribe",
    ];
    !EXCLUDE.iter().any(|bad| id.contains(bad))
}

fn append_turn(messages: &mut Vec<Value>, turn: &Turn) {
    match turn {
        Turn::User(text) => messages.push(json!({ "role": "user", "content": text })),
        Turn::Model(mt) => {
            let mut msg = json!({ "role": "assistant" });
            // content must be present; null is allowed alongside tool_calls.
            msg["content"] = match &mt.text {
                Some(t) if !t.is_empty() => json!(t),
                _ => Value::Null,
            };
            if !mt.tool_calls.is_empty() {
                let calls: Vec<Value> = mt
                    .tool_calls
                    .iter()
                    .map(|c| {
                        json!({
                            "id": c.id,
                            "type": "function",
                            "function": {
                                "name": c.name,
                                "arguments": c.args.to_string(),
                            }
                        })
                    })
                    .collect();
                msg["tool_calls"] = json!(calls);
            }
            messages.push(msg);
        }
        Turn::ToolResults(results) => {
            for r in results {
                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": r.call_id,
                    "content": r.content,
                }));
            }
        }
    }
}

fn parse_model_turn(resp: &Value) -> AppResult<ModelTurn> {
    let message = resp.pointer("/choices/0/message");
    let message = match message {
        Some(m) => m,
        None => return Ok(ModelTurn::default()),
    };

    let text = message
        .get("content")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let mut tool_calls = Vec::new();
    if let Some(calls) = message.get("tool_calls").and_then(Value::as_array) {
        for call in calls {
            let id = call
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let func = call.get("function");
            let name = func
                .and_then(|f| f.get("name"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let args_str = func
                .and_then(|f| f.get("arguments"))
                .and_then(Value::as_str)
                .unwrap_or("{}");
            let args = serde_json::from_str(args_str).unwrap_or(Value::Object(Default::default()));
            tool_calls.push(ToolCall { id, name, args });
        }
    }

    Ok(ModelTurn { text, tool_calls })
}
