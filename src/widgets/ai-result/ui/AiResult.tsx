import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Card,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import type { ChatMessage } from "@features/ai-request";
import type { QueryRun } from "@entities/ai";
import { DataTable } from "./DataTable";
import { Markdown } from "./Markdown";

type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

const INTENT_LABEL: Record<string, string> = {
  analiz: "Analiz",
  prognoz: "Prognoz",
  improve: "Improve",
  discomfort: "Discomfort",
  custom: "Custom",
};

function QueryBlock({ q, index }: { q: QueryRun; index: number }) {
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" fontWeight={700} color="text.secondary">
          Query {index + 1}
        </Typography>
        <Chip
          size="small"
          label={q.ok ? `${q.row_count} rows` : "error"}
          color={q.ok ? "default" : "error"}
          variant="outlined"
        />
      </Stack>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          borderRadius: "10px",
          backgroundColor: (t) =>
            t.palette.mode === "light" ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.05)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {q.sql}
      </Box>
      {q.ok ? (
        q.rows ? <DataTable rows={q.rows} /> : null
      ) : (
        <Alert severity="error" sx={{ py: 0 }}>
          {q.error ?? "Query failed"}
        </Alert>
      )}
    </Stack>
  );
}

export function AiResult({ message }: { message: AssistantMessage }) {
  const { intent, text, queries, streaming } = message;
  const waiting = streaming && text.length === 0;

  return (
    <Card sx={{ borderRadius: "16px", p: 3, flexShrink: 0 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <Chip size="small" label={INTENT_LABEL[intent] ?? intent} color="primary" />
        </Stack>

        {waiting ? (
          <Typography variant="body2" color="text.secondary">
            Ma'lumotlar tahlil qilinmoqda…
          </Typography>
        ) : (
          <Box>
            <Markdown>{text || "(tahlil natijasi yo'q)"}</Markdown>
            {streaming ? (
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  width: "0.6em",
                  ml: "2px",
                  animation: "ai-caret 1s steps(2) infinite",
                  "@keyframes ai-caret": { "50%": { opacity: 0 } },
                }}
              >
                ▌
              </Box>
            ) : null}
          </Box>
        )}

        {queries.length > 0 ? (
          <>
            <Divider />
            <Accordion
              disableGutters
              elevation={0}
              sx={{ background: "transparent", "&:before": { display: "none" } }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <StorageRoundedIcon fontSize="small" color="action" />
                  <Typography variant="body2" fontWeight={600}>
                    Data &amp; SQL ({queries.length})
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                <Stack spacing={2.5} divider={<Divider flexItem />}>
                  {queries.map((q, i) => (
                    <QueryBlock key={i} q={q} index={i} />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          </>
        ) : null}
      </Stack>
    </Card>
  );
}
