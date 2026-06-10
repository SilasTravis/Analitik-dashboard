pub mod gemini;
pub mod openai;
pub mod schema;
pub mod sql_guard;

use async_trait::async_trait;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_postgres::{Client, SimpleQueryMessage};

use crate::db::error::{AppError, AppResult};
use crate::security::ai_settings::AiSettings;

const MAX_TOOL_ROUNDS: usize = 5;
const STATEMENT_TIMEOUT_MS: u32 = 5000;
/// Cap on remembered turns (user + assistant) to bound context growth.
const MAX_MEMORY_TURNS: usize = 20;
/// Tauri event channel the chat streams deltas/progress on.
const CHAT_EVENT: &str = "ai-chat";

// ───────────────────────── neutral conversation types ─────────────────────────

#[derive(Clone)]
pub enum Turn {
    User(String),
    Model(ModelTurn),
    ToolResults(Vec<ToolResult>),
}

#[derive(Clone, Default)]
pub struct ModelTurn {
    pub text: Option<String>,
    pub tool_calls: Vec<ToolCall>,
}

#[derive(Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: Value,
}

#[derive(Clone)]
pub struct ToolResult {
    /// Matches the originating ToolCall. Gemini matches by name, but id-based
    /// providers (OpenAI/Claude) need this to correlate results.
    #[allow(dead_code)]
    pub call_id: String,
    pub name: String,
    /// JSON-encoded content returned to the model.
    pub content: String,
}

pub struct ToolSpec {
    pub name: String,
    pub description: String,
    /// JSON-schema (OpenAI style, lowercase types). Providers adapt as needed.
    pub parameters: Value,
}

/// One AI turn: given the system prompt, prior turns, and available tools,
/// return the model's next move (text and/or tool calls).
#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn complete(
        &self,
        system: &str,
        turns: &[Turn],
        tools: &[ToolSpec],
    ) -> AppResult<ModelTurn>;

    /// Like `complete`, but invokes `on_delta` for each text fragment as it
    /// arrives. The default is non-streaming: it emits the whole answer once.
    /// Providers that support server-sent events override this.
    async fn complete_stream(
        &self,
        system: &str,
        turns: &[Turn],
        tools: &[ToolSpec],
        on_delta: &(dyn for<'a> Fn(&'a str) + Send + Sync),
    ) -> AppResult<ModelTurn> {
        let turn = self.complete(system, turns, tools).await?;
        if let Some(t) = &turn.text {
            if !t.is_empty() {
                on_delta(t);
            }
        }
        Ok(turn)
    }
}

pub fn build_provider(settings: &AiSettings) -> AppResult<Box<dyn AiProvider>> {
    match settings.provider.as_str() {
        "gemini" => Ok(Box::new(gemini::Gemini::new(
            settings.api_key.clone(),
            settings.model.clone(),
        ))),
        "openai" => Ok(Box::new(openai::OpenAi::new(
            settings.api_key.clone(),
            settings.model.clone(),
        ))),
        other => Err(AppError::Message(format!("unknown AI provider: {other}"))),
    }
}

// ───────────────────────── shared state (schema cache) ─────────────────────────

#[derive(Default)]
pub struct AiState {
    schema_cache: Mutex<Option<String>>,
    /// Running conversation (user + assistant text turns) for follow-up context.
    /// In-memory only — cleared on app restart or via `reset`.
    conversation: Mutex<Vec<Turn>>,
}

impl AiState {
    pub async fn schema(&self, client: &Client) -> AppResult<String> {
        let mut guard = self.schema_cache.lock().await;
        if let Some(s) = guard.as_ref() {
            return Ok(s.clone());
        }
        let s = schema::build(client).await?;
        *guard = Some(s.clone());
        Ok(s)
    }

    async fn history(&self) -> Vec<Turn> {
        self.conversation.lock().await.clone()
    }

    async fn remember(&self, user: Turn, assistant: Turn) {
        let mut c = self.conversation.lock().await;
        c.push(user);
        c.push(assistant);
        let len = c.len();
        if len > MAX_MEMORY_TURNS {
            c.drain(0..len - MAX_MEMORY_TURNS);
        }
    }

    pub async fn reset(&self) {
        self.conversation.lock().await.clear();
    }
}

// ───────────────────────── result types (to frontend) ─────────────────────────

#[derive(Serialize)]
pub struct QueryRun {
    pub sql: String,
    pub ok: bool,
    pub error: Option<String>,
    pub rows: Value,
    pub row_count: usize,
}

#[derive(Serialize)]
pub struct AiAnalyzeResult {
    pub analysis: String,
    pub queries: Vec<QueryRun>,
}

// ───────────────────────── the run_sql tool ─────────────────────────

fn run_sql_tool() -> ToolSpec {
    ToolSpec {
        name: "run_sql".into(),
        description: "Run a single read-only SQL query (SELECT or WITH...SELECT) against the \
                      analytics Postgres database and get the rows back as JSON. Writes, DDL, \
                      multiple statements, and comments are rejected."
            .into(),
        parameters: json!({
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "A single read-only SELECT (or WITH ... SELECT) query."
                }
            },
            "required": ["sql"]
        }),
    }
}

/// Validate, then execute a single SELECT inside a read-only, time-limited
/// transaction. Returns the rows as a JSON array (capped at `ROW_CAP`).
pub async fn run_select(client: &Client, raw_sql: &str) -> AppResult<Value> {
    let validated = sql_guard::validate(raw_sql)?;
    let wrapped = format!(
        "SELECT COALESCE(json_agg(t), '[]')::text AS data \
         FROM (SELECT * FROM ({}) __inner LIMIT {}) t",
        validated,
        sql_guard::ROW_CAP
    );
    let batch = format!(
        "BEGIN; SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT_MS}'; {wrapped}; COMMIT;"
    );

    let messages = match client.simple_query(&batch).await {
        Ok(m) => m,
        Err(e) => {
            // Leave the shared connection usable for the next query.
            let _ = client.simple_query("ROLLBACK").await;
            return Err(AppError::from(e));
        }
    };

    for msg in messages {
        if let SimpleQueryMessage::Row(row) = msg {
            if let Some(data) = row.get("data") {
                return Ok(serde_json::from_str(data)?);
            }
        }
    }
    Ok(Value::Array(vec![]))
}

// ───────────────────────── orchestration loop ─────────────────────────

/// Multi-turn chat: streams the answer over the `ai-chat` Tauri event, runs
/// `run_sql` tool rounds, remembers prior turns for follow-up context.
pub async fn chat(
    app: &AppHandle,
    client: &Client,
    state: &AiState,
    provider: &dyn AiProvider,
    schema: &str,
    intent: &str,
    question: Option<&str>,
) -> AppResult<AiAnalyzeResult> {
    let system = build_system(intent, schema);
    let tools = vec![run_sql_tool()];
    let user_msg = build_user_message(intent, question);

    let mut turns = state.history().await;
    turns.push(Turn::User(user_msg.clone()));

    let on_delta = |s: &str| {
        let _ = app.emit(CHAT_EVENT, json!({ "kind": "delta", "text": s }));
    };

    let mut queries: Vec<QueryRun> = Vec::new();
    let mut analysis = String::new();
    let mut answered = false;

    for _ in 0..MAX_TOOL_ROUNDS {
        let model_turn = provider
            .complete_stream(&system, &turns, &tools, &on_delta)
            .await?;

        if model_turn.tool_calls.is_empty() {
            analysis = model_turn.text.unwrap_or_default();
            answered = true;
            break;
        }

        turns.push(Turn::Model(model_turn.clone()));

        let mut results = Vec::with_capacity(model_turn.tool_calls.len());
        for call in &model_turn.tool_calls {
            let sql = call
                .args
                .get("sql")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();

            let (content, run) = match run_select(client, &sql).await {
                Ok(rows) => {
                    let row_count = rows.as_array().map(Vec::len).unwrap_or(0);
                    let content = serde_json::to_string(&rows)?;
                    (
                        content,
                        QueryRun { sql, ok: true, error: None, rows, row_count },
                    )
                }
                Err(e) => {
                    let msg = e.to_string();
                    (
                        json!({ "error": msg }).to_string(),
                        QueryRun {
                            sql,
                            ok: false,
                            error: Some(msg),
                            rows: Value::Null,
                            row_count: 0,
                        },
                    )
                }
            };
            let _ = app.emit(
                CHAT_EVENT,
                json!({ "kind": "query", "sql": run.sql, "ok": run.ok, "row_count": run.row_count }),
            );
            queries.push(run);
            results.push(ToolResult {
                call_id: call.id.clone(),
                name: call.name.clone(),
                content,
            });
        }
        turns.push(Turn::ToolResults(results));
    }

    if !answered {
        // Budget exhausted — force a final, tool-free answer from what we gathered.
        let final_turn = provider
            .complete_stream(&system, &turns, &[], &on_delta)
            .await?;
        analysis = final_turn.text.unwrap_or_default();
    }

    state
        .remember(
            Turn::User(user_msg),
            Turn::Model(ModelTurn {
                text: Some(analysis.clone()),
                tool_calls: Vec::new(),
            }),
        )
        .await;

    let _ = app.emit(CHAT_EVENT, json!({ "kind": "done" }));
    Ok(AiAnalyzeResult { analysis, queries })
}

fn build_system(intent: &str, schema: &str) -> String {
    format!(
        "You are a senior data analyst for an e-commerce analytics database (PostgreSQL).\n\
         You answer by querying the database with the `run_sql` tool, then interpreting the results.\n\n\
         Rules:\n\
         - Read data only via `run_sql`. It accepts ONE read-only SELECT (or WITH...SELECT).\n\
         - Use the exact table and column names from the schema below.\n\
         - Join tables using the relationships in the schema: `[pk]` marks a primary key and\n\
           `col -> table.col` marks a foreign key. If two tables share a column with the same\n\
           name (e.g. a code or id) and no explicit foreign key is shown, join on that column.\n\
         - Many tables use soft deletes: when a `deleted_at` column exists, exclude rows where\n\
           it is NOT NULL unless the user explicitly asks about deleted records.\n\
         - When a table has several localized name columns (e.g. name_ru / name_uz / name_kr),\n\
           use COALESCE of the non-empty ones for a human-readable label.\n\
         - For \"best selling\" / \"most sold\" products, aggregate quantities and totals from the\n\
           order line-items table joined to its product table — do not use page-view counts,\n\
           which measure browsing, not purchases.\n\
         - Prefer aggregated queries; keep result sets small (the tool caps rows).\n\
         - Never invent numbers — state only what the data shows.\n\
         - When you have enough data, stop calling tools and write a concise, structured\n\
           analysis with concrete numbers.\n\
         - Write the final analysis in Uzbek (o'zbek tilida). SQL queries stay in English,\n\
           but all explanatory prose addressed to the user must be in Uzbek.\n\n\
         {task}\n\n\
         {domain}\n\n\
         DATABASE SCHEMA (one line per table; `[pk]` = primary key, `-> t.c` = foreign key):\n{schema}",
        task = intent_instruction(intent),
        domain = DOMAIN_GUIDE,
        schema = schema,
    )
}

/// Domain knowledge distilled from the dashboard's own analytics queries, so the
/// model joins tables and computes metrics the same way the app does.
const DOMAIN_GUIDE: &str = "\
DOMAIN GUIDE (this is an e-commerce store, mediapark.uz):\n\
- Time columns differ: analytics_* tables filter on `occurred_at`; `orders` and\n\
  `order_products` filter on `created_at`. Use the right column per table.\n\
- Soft deletes: a valid order has `orders.deleted_at IS NULL` (same for order_products).\n\
  Always exclude soft-deleted rows unless asked otherwise.\n\
- Core metrics:\n\
  * Visits   = COUNT(*) FROM analytics_page_views.\n\
  * Sessions = COUNT(DISTINCT session_id) FROM analytics_sessions.\n\
  * Orders   = COUNT(*) FROM orders WHERE deleted_at IS NULL.\n\
  * Revenue  = SUM(orders.total_price) WHERE deleted_at IS NULL (integer minor units, UZS).\n\
  * Avg order value = revenue / orders;  Conversion = orders / sessions.\n\
- Products sold (\"best selling\", \"most sold\", \"top products\"): use the order\n\
  line-items, NOT page views. Pattern:\n\
    FROM order_products op\n\
    JOIN orders o ON o.id = op.order_id AND o.deleted_at IS NULL\n\
    LEFT JOIN products p ON p.sap_code = op.sap_code\n\
  Units sold = SUM(op.quantity); revenue = SUM(op.total_price).\n\
- Product fields: name = COALESCE(NULLIF(p.name_ru,''), NULLIF(p.name_uz,''), NULLIF(p.name_kr,'')).\n\
  Category = p.category_name; subcategory = p.subcategory_name; brand = p.brand_name.\n\
  \"What kind / category of products\" → GROUP BY p.category_name.\n\
- Traffic sources: analytics_page_views.utm_source / utm_campaign / referrer.\n\
  Order attribution: join orders.session_id = analytics_page_views.session_id,\n\
  or use orders.order_source_type (NULL/'' means 'direct').\n\
- Devices: analytics_sessions.is_mobile (bool) and .browser. Geo:\n\
  analytics_page_views.viewer_country / viewer_city.\n\
- Engagement events: analytics_basket (add-to-cart), analytics_like, analytics_compare —\n\
  each keyed by session_id / occurred_at.";

fn intent_instruction(intent: &str) -> &'static str {
    match intent {
        "analiz" => "Task: Give a general analysis of the data most relevant to the user's request — \
            key metrics, recent trends, and notable patterns.",
        "prognoz" => "Task: Produce a forecast. Query recent time-series data, then describe the \
            expected near-term trend grounded in the historical pattern. Be explicit about uncertainty.",
        "improve" => "Task: Identify concrete opportunities to improve conversion and revenue. \
            Back every suggestion with data you query.",
        "discomfort" => "Task: Identify friction and pain points in the user journey (drop-offs, \
            cart abandonment, slow or error-prone pages). Back every finding with data.",
        _ => "Task: Answer the user's request using the database.",
    }
}

fn build_user_message(intent: &str, question: Option<&str>) -> String {
    match question {
        Some(q) if !q.trim().is_empty() => q.trim().to_string(),
        _ => match intent {
            "analiz" => "Analyze the most relevant and recent data.".into(),
            "prognoz" => "Forecast the near-term trend from recent data.".into(),
            "improve" => "Find the best opportunities to improve conversion and revenue.".into(),
            "discomfort" => "Find the main friction points in the user journey.".into(),
            _ => "Analyze the data.".into(),
        },
    }
}
