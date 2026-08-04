use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::error::{AppError, AppResult};
use crate::db::pool::ConnectionState;

const SET_STATEMENT_TIMEOUT_SQL: &str = "SET statement_timeout = '5s'";
const RESET_STATEMENT_TIMEOUT_SQL: &str = "RESET statement_timeout";
const MAX_GEO_HEATMAP_DAYS: i64 = 31;
const MAX_GEO_HEATMAP_POINTS: usize = 50_000;

const UZBEKISTAN_WEST: f64 = 55.9;
const UZBEKISTAN_SOUTH: f64 = 37.1;
const UZBEKISTAN_EAST: f64 = 73.2;
const UZBEKISTAN_NORTH: f64 = 45.7;

const SOURCE_TYPES_SQL: &str = r#"
WITH RECURSIVE source_values(source_type) AS (
    (
        SELECT source_type
        FROM analytics_sessions
        WHERE source_type IS NOT NULL
        ORDER BY source_type
        LIMIT 1
    )
    UNION ALL
    SELECT (
        SELECT sessions.source_type
        FROM analytics_sessions sessions
        WHERE sessions.source_type > source_values.source_type
          AND sessions.source_type IS NOT NULL
        ORDER BY sessions.source_type
        LIMIT 1
    )
    FROM source_values
    WHERE source_values.source_type IS NOT NULL
)
SELECT source_type
FROM source_values
WHERE source_type IS NOT NULL
ORDER BY source_type;
"#;

const GEO_HEATMAP_SQL: &str = r#"
WITH normalized AS (
    SELECT CASE
               WHEN geo[0] BETWEEN 55.9 AND 73.2 AND geo[1] BETWEEN 37.1 AND 45.7
                   THEN geo[0]
               WHEN geo[1] BETWEEN 55.9 AND 73.2 AND geo[0] BETWEEN 37.1 AND 45.7
                   THEN geo[1]
           END AS longitude,
           CASE
               WHEN geo[0] BETWEEN 55.9 AND 73.2 AND geo[1] BETWEEN 37.1 AND 45.7
                   THEN geo[1]
               WHEN geo[1] BETWEEN 55.9 AND 73.2 AND geo[0] BETWEEN 37.1 AND 45.7
                   THEN geo[0]
           END AS latitude
    FROM analytics_sessions
    WHERE (source_type = ANY($7::text[]) OR source_type IS NULL)
      AND session_registered_at BETWEEN
          (($1::timestamptz - interval '5 minutes') AT TIME ZONE 'UTC') AND
          (($2::timestamptz + interval '5 minutes') AT TIME ZONE 'UTC')
      AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
      AND geo IS NOT NULL
)
SELECT longitude, latitude, 1.0::double precision AS weight
FROM normalized
WHERE longitude >= $3
  AND longitude <= $4
  AND latitude >= $5
  AND latitude <= $6
LIMIT 50001;
"#;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoHeatmapArgs {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub west: f64,
    pub south: f64,
    pub east: f64,
    pub north: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct GeoHeatmapPoint(pub f64, pub f64, pub f64);

#[derive(Debug, Serialize)]
pub struct GeoHeatmapResponse {
    pub points: Vec<GeoHeatmapPoint>,
}

fn validate_args(args: &GeoHeatmapArgs) -> AppResult<()> {
    if args.to <= args.from {
        return Err(AppError::Message(
            "GEO range end must be after its start".into(),
        ));
    }
    if args.to - args.from > Duration::days(MAX_GEO_HEATMAP_DAYS) {
        return Err(AppError::Message(format!(
            "GEO range cannot exceed {MAX_GEO_HEATMAP_DAYS} days"
        )));
    }

    let bounds = [args.west, args.south, args.east, args.north];
    if bounds.iter().any(|value| !value.is_finite()) {
        return Err(AppError::Message("GEO bounds must be finite".into()));
    }
    if args.west >= args.east || args.south >= args.north {
        return Err(AppError::Message(
            "GEO bounds must have positive width and height".into(),
        ));
    }
    if args.west < UZBEKISTAN_WEST
        || args.south < UZBEKISTAN_SOUTH
        || args.east > UZBEKISTAN_EAST
        || args.north > UZBEKISTAN_NORTH
    {
        return Err(AppError::Message(
            "GEO bounds must remain inside Uzbekistan".into(),
        ));
    }

    Ok(())
}

fn build_response(points: Vec<GeoHeatmapPoint>) -> AppResult<GeoHeatmapResponse> {
    if points.len() > MAX_GEO_HEATMAP_POINTS {
        return Err(AppError::Message(format!(
            "GEO viewport contains more than {MAX_GEO_HEATMAP_POINTS} points; zoom in or shorten the date range"
        )));
    }
    Ok(GeoHeatmapResponse { points })
}

fn finish_after_reset<T, E>(
    query_result: Result<T, E>,
    reset_result: Result<(), E>,
) -> Result<T, E> {
    match query_result {
        Err(query_error) => Err(query_error),
        Ok(value) => reset_result.map(|()| value),
    }
}

#[tauri::command]
pub async fn get_geo_heatmap(
    state: State<'_, ConnectionState>,
    args: GeoHeatmapArgs,
) -> AppResult<GeoHeatmapResponse> {
    validate_args(&args)?;

    let client = state.analytics_client().await?;
    client.batch_execute(SET_STATEMENT_TIMEOUT_SQL).await?;

    let query_result = async {
        let source_rows = client.query(SOURCE_TYPES_SQL, &[]).await?;
        let source_types = source_rows
            .into_iter()
            .map(|row| row.try_get("source_type"))
            .collect::<Result<Vec<String>, _>>()?;
        client
            .query(
                GEO_HEATMAP_SQL,
                &[
                    &args.from,
                    &args.to,
                    &args.west,
                    &args.east,
                    &args.south,
                    &args.north,
                    &source_types,
                ],
            )
            .await
    }
    .await;

    let reset_result = client.batch_execute(RESET_STATEMENT_TIMEOUT_SQL).await;
    let rows = finish_after_reset(query_result, reset_result)?;
    let points = rows
        .into_iter()
        .map(|row| {
            Ok(GeoHeatmapPoint(
                row.try_get("longitude")?,
                row.try_get("latitude")?,
                row.try_get("weight")?,
            ))
        })
        .collect::<AppResult<Vec<_>>>()?;

    build_response(points)
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};

    use super::{
        build_response, finish_after_reset, validate_args, GeoHeatmapArgs, GeoHeatmapPoint,
        GEO_HEATMAP_SQL, MAX_GEO_HEATMAP_POINTS, RESET_STATEMENT_TIMEOUT_SQL,
        SET_STATEMENT_TIMEOUT_SQL,
    };

    fn valid_args() -> GeoHeatmapArgs {
        GeoHeatmapArgs {
            from: Utc::now() - Duration::days(7),
            to: Utc::now(),
            west: 66.0,
            south: 39.0,
            east: 71.0,
            north: 43.0,
        }
    }

    #[test]
    fn geo_heatmap_accepts_a_valid_date_range_and_viewport() {
        assert!(validate_args(&valid_args()).is_ok());
    }

    #[test]
    fn geo_heatmap_rejects_inverted_and_overlong_ranges() {
        let mut inverted = valid_args();
        inverted.from = inverted.to;
        assert!(validate_args(&inverted).is_err());

        let mut overlong = valid_args();
        overlong.from = overlong.to - Duration::days(32);
        assert!(validate_args(&overlong).is_err());
    }

    #[test]
    fn geo_heatmap_rejects_invalid_viewports() {
        let mut inverted_longitude = valid_args();
        inverted_longitude.west = inverted_longitude.east;
        assert!(validate_args(&inverted_longitude).is_err());

        let mut inverted_latitude = valid_args();
        inverted_latitude.south = inverted_latitude.north;
        assert!(validate_args(&inverted_latitude).is_err());

        let mut outside_uzbekistan = valid_args();
        outside_uzbekistan.west = 50.0;
        assert!(validate_args(&outside_uzbekistan).is_err());

        let mut non_finite = valid_args();
        non_finite.north = f64::NAN;
        assert!(validate_args(&non_finite).is_err());
    }

    #[test]
    fn geo_heatmap_sql_filters_time_bounds_and_returns_compact_unit_weights() {
        let sql = GEO_HEATMAP_SQL
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        assert!(sql.contains("FROM analytics_sessions"));
        assert!(sql.contains("session_registered_at BETWEEN"));
        assert!(sql.contains("occurred_at BETWEEN $1::timestamptz AND $2::timestamptz"));
        assert!(sql.contains("longitude >= $3"));
        assert!(sql.contains("longitude <= $4"));
        assert!(sql.contains("latitude >= $5"));
        assert!(sql.contains("latitude <= $6"));
        assert!(sql.contains("SELECT longitude, latitude, 1.0::double precision AS weight"));
        assert!(sql.contains("LIMIT 50001"));
        assert!(!sql.contains("AS MATERIALIZED"));
        assert!(!sql.to_lowercase().contains("select session_id"));
    }

    #[test]
    fn geo_heatmap_response_serializes_points_as_compact_arrays() {
        let response = build_response(vec![GeoHeatmapPoint(69.2401, 41.2995, 1.0)])
            .expect("one point is safe");
        let json = serde_json::to_value(response).expect("response serializes");

        assert_eq!(
            json,
            serde_json::json!({ "points": [[69.2401, 41.2995, 1.0]] })
        );
    }

    #[test]
    fn geo_heatmap_response_rejects_the_overflow_sentinel() {
        let points = (0..=MAX_GEO_HEATMAP_POINTS)
            .map(|_| GeoHeatmapPoint(69.2401, 41.2995, 1.0))
            .collect();

        assert!(build_response(points).is_err());
    }

    #[test]
    fn geo_heatmap_timeout_is_short_and_always_resettable() {
        assert_eq!(SET_STATEMENT_TIMEOUT_SQL, "SET statement_timeout = '5s'");
        assert_eq!(RESET_STATEMENT_TIMEOUT_SQL, "RESET statement_timeout");
        assert_eq!(
            finish_after_reset::<(), _>(Err("query failed"), Err("reset failed")),
            Err("query failed")
        );
        assert_eq!(
            finish_after_reset(Ok(42), Err("reset failed")),
            Err("reset failed")
        );
    }
}
