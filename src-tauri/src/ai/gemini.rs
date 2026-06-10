use async_trait::async_trait;
use serde_json::{json, Value};

use crate::db::error::{AppError, AppResult};

use super::{AiProvider, ModelTurn, ToolCall, ToolResult, ToolSpec, Turn};

const DEFAULT_MODEL: &str = "gemini-2.0-flash";
const BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";

pub struct Gemini {
    api_key: String,
    model: String,
    http: reqwest::Client,
}

impl Gemini {
    pub fn new(api_key: String, model: Option<String>) -> Self {
        Gemini {
            api_key,
            model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
            http: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for Gemini {
    async fn complete(
        &self,
        system: &str,
        turns: &[Turn],
        tools: &[ToolSpec],
    ) -> AppResult<ModelTurn> {
        if self.api_key.is_empty() {
            return Err(AppError::Message("Gemini API key is not set".into()));
        }

        let mut body = json!({
            "system_instruction": { "parts": [{ "text": system }] },
            "contents": turns.iter().map(turn_to_content).collect::<Vec<_>>(),
        });

        if !tools.is_empty() {
            let decls: Vec<Value> = tools
                .iter()
                .map(|t| {
                    json!({
                        "name": t.name,
                        "description": t.description,
                        "parameters": to_gemini_schema(&t.parameters),
                    })
                })
                .collect();
            body["tools"] = json!([{ "function_declarations": decls }]);
            body["tool_config"] = json!({ "function_calling_config": { "mode": "AUTO" } });
        }

        let url = format!("{BASE_URL}/{}:generateContent", self.model);
        let resp = self
            .http
            .post(&url)
            .query(&[("key", &self.api_key)])
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Message(format!("Gemini request failed: {e}")))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| AppError::Message(format!("Gemini response read failed: {e}")))?;

        if !status.is_success() {
            return Err(AppError::Message(format!(
                "Gemini API error {status}: {text}"
            )));
        }

        let parsed: Value = serde_json::from_str(&text)
            .map_err(|e| AppError::Message(format!("Gemini JSON parse failed: {e}")))?;
        parse_model_turn(&parsed)
    }
}

/// Fetch the live list of Gemini model ids that support `generateContent`.
pub async fn list_models(api_key: &str) -> AppResult<Vec<String>> {
    if api_key.is_empty() {
        return Err(AppError::Message("Gemini API key is not set".into()));
    }
    let http = reqwest::Client::new();
    let resp = http
        .get(BASE_URL)
        .query(&[("key", api_key), ("pageSize", "1000")])
        .send()
        .await
        .map_err(|e| AppError::Message(format!("Gemini request failed: {e}")))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| AppError::Message(format!("Gemini response read failed: {e}")))?;
    if !status.is_success() {
        return Err(AppError::Message(format!("Gemini API error {status}: {text}")));
    }

    let parsed: Value = serde_json::from_str(&text)
        .map_err(|e| AppError::Message(format!("Gemini JSON parse failed: {e}")))?;

    let mut out = Vec::new();
    if let Some(models) = parsed.get("models").and_then(Value::as_array) {
        for m in models {
            let supports = m
                .get("supportedGenerationMethods")
                .and_then(Value::as_array)
                .map(|a| a.iter().any(|v| v.as_str() == Some("generateContent")))
                .unwrap_or(false);
            if !supports {
                continue;
            }
            if let Some(name) = m.get("name").and_then(Value::as_str) {
                let id = name.strip_prefix("models/").unwrap_or(name);
                if id.starts_with("gemini") {
                    out.push(id.to_string());
                }
            }
        }
    }
    out.sort();
    out.dedup();
    Ok(out)
}

fn turn_to_content(turn: &Turn) -> Value {
    match turn {
        Turn::User(text) => json!({ "role": "user", "parts": [{ "text": text }] }),
        Turn::Model(mt) => {
            let mut parts = Vec::new();
            if let Some(t) = &mt.text {
                if !t.is_empty() {
                    parts.push(json!({ "text": t }));
                }
            }
            for call in &mt.tool_calls {
                parts.push(json!({
                    "functionCall": { "name": call.name, "args": call.args }
                }));
            }
            json!({ "role": "model", "parts": parts })
        }
        Turn::ToolResults(results) => {
            let parts: Vec<Value> = results.iter().map(tool_result_part).collect();
            json!({ "role": "user", "parts": parts })
        }
    }
}

fn tool_result_part(result: &ToolResult) -> Value {
    // functionResponse.response must be a JSON object; wrap whatever we have.
    let parsed: Value = serde_json::from_str(&result.content).unwrap_or(Value::Null);
    json!({
        "functionResponse": {
            "name": result.name,
            "response": { "result": parsed }
        }
    })
}

fn parse_model_turn(resp: &Value) -> AppResult<ModelTurn> {
    let parts = resp
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array);

    let parts = match parts {
        Some(p) => p,
        None => {
            // No candidate parts — surface a prompt-feedback block if present.
            if let Some(reason) = resp.pointer("/promptFeedback/blockReason") {
                return Err(AppError::Message(format!("Gemini blocked the prompt: {reason}")));
            }
            return Ok(ModelTurn::default());
        }
    };

    let mut text = String::new();
    let mut tool_calls = Vec::new();
    for (i, part) in parts.iter().enumerate() {
        if let Some(t) = part.get("text").and_then(Value::as_str) {
            text.push_str(t);
        }
        if let Some(fc) = part.get("functionCall") {
            let name = fc
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let args = fc.get("args").cloned().unwrap_or(Value::Object(Default::default()));
            tool_calls.push(ToolCall {
                id: format!("call_{i}"),
                name,
                args,
            });
        }
    }

    Ok(ModelTurn {
        text: if text.is_empty() { None } else { Some(text) },
        tool_calls,
    })
}

/// Gemini's function-declaration schema expects uppercase `type` values
/// (OBJECT, STRING, ...). Recursively uppercase the generic JSON schema.
fn to_gemini_schema(schema: &Value) -> Value {
    match schema {
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, v) in map {
                if k == "type" {
                    if let Some(s) = v.as_str() {
                        out.insert(k.clone(), Value::String(s.to_ascii_uppercase()));
                        continue;
                    }
                }
                out.insert(k.clone(), to_gemini_schema(v));
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(to_gemini_schema).collect()),
        other => other.clone(),
    }
}
