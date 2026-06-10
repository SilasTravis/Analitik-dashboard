use crate::db::error::{AppError, AppResult};

/// Hard cap on rows returned to the model, regardless of any LIMIT it writes.
pub const ROW_CAP: usize = 500;

/// Keywords that must never appear in an AI-generated query. A read-only
/// transaction already blocks writes at the engine; this is defense-in-depth so
/// a malicious/confused model can't even attempt them.
const FORBIDDEN: &[&str] = &[
    "insert", "update", "delete", "drop", "alter", "create", "truncate", "grant",
    "revoke", "copy", "merge", "call", "do", "vacuum", "analyze", "comment",
    "reindex", "cluster", "refresh", "lock", "set", "reset", "begin", "start",
    "commit", "rollback", "savepoint", "prepare", "execute", "listen", "notify",
];

fn reject(msg: impl Into<String>) -> AppError {
    AppError::Message(format!("rejected SQL: {}", msg.into()))
}

/// Validate that `sql` is a single, read-only SELECT/CTE statement and return it
/// normalized (trailing semicolon stripped). Errors otherwise.
pub fn validate(sql: &str) -> AppResult<String> {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return Err(reject("empty query"));
    }

    // No SQL comments — they can hide intent.
    if trimmed.contains("--") || trimmed.contains("/*") {
        return Err(reject("comments are not allowed"));
    }

    // Single statement only: allow exactly one optional trailing semicolon.
    let body = trimmed.strip_suffix(';').unwrap_or(trimmed).trim();
    if body.contains(';') {
        return Err(reject("multiple statements are not allowed"));
    }

    let lower = body.to_ascii_lowercase();
    if !(lower.starts_with("select") || lower.starts_with("with")) {
        return Err(reject("only SELECT/WITH queries are allowed"));
    }

    for kw in FORBIDDEN {
        if contains_word(&lower, kw) {
            return Err(reject(format!("keyword `{kw}` is not allowed")));
        }
    }

    Ok(body.to_string())
}

/// Whole-word, case-insensitive match (so `created_at` doesn't trip `create`).
fn contains_word(haystack: &str, word: &str) -> bool {
    let mut from = 0;
    while let Some(pos) = haystack[from..].find(word) {
        let start = from + pos;
        let end = start + word.len();
        let before_ok = start == 0
            || !haystack.as_bytes()[start - 1].is_ascii_alphanumeric()
                && haystack.as_bytes()[start - 1] != b'_';
        let after_ok = end >= haystack.len()
            || !haystack.as_bytes()[end].is_ascii_alphanumeric() && haystack.as_bytes()[end] != b'_';
        if before_ok && after_ok {
            return true;
        }
        from = start + word.len();
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_select() {
        assert!(validate("SELECT count(*) FROM orders").is_ok());
    }

    #[test]
    fn accepts_cte() {
        assert!(validate("WITH x AS (SELECT 1) SELECT * FROM x;").is_ok());
    }

    #[test]
    fn column_named_create_is_fine() {
        assert!(validate("SELECT created_at, updated_at FROM orders").is_ok());
    }

    #[test]
    fn rejects_write() {
        assert!(validate("DELETE FROM orders").is_err());
        assert!(validate("SELECT 1; DROP TABLE orders").is_err());
        assert!(validate("INSERT INTO orders VALUES (1)").is_err());
    }

    #[test]
    fn rejects_comments_and_multi() {
        assert!(validate("SELECT 1 -- nope").is_err());
        assert!(validate("SELECT 1; SELECT 2").is_err());
    }
}
