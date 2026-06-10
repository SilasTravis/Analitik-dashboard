import { Alert, Box, Stack, Typography } from "@mui/material";
import { Sidebar } from "@widgets/sidebar";
import { Header } from "@widgets/header";
import { AiResult } from "@widgets/ai-result";
import {
  AiInputBar,
  ChatHistoryPanel,
  GradientBar,
  PresetGrid,
  useAiScanner,
} from "@features/ai-request";
import { AiSettingsCard } from "@features/ai-settings";

export function AiScannerPage() {
  const ai = useAiScanner();
  const locked = !ai.isConfigured || ai.isRunning;
  const showSetup = !ai.isConfigured && !ai.settingsLoading;

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Header
          title="AI Scanner"
          subtitle="Ask the AI to analyze, forecast, and compare your data"
        />

        <Box
          sx={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            gap: 2,
            p: 4,
            backgroundColor: (t) => t.palette.background.default,
            "& .MuiCard-root": {
              background: (t) =>
                t.palette.mode === "light"
                  ? "linear-gradient(135deg, rgba(248, 250, 252, 0.55) 0%, rgba(241, 245, 249, 0.35) 100%)"
                  : "linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.3) 100%)",
              backdropFilter: "blur(24px) saturate(190%)",
              border: (t) =>
                t.palette.mode === "light"
                  ? "1px solid rgba(255, 255, 255, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
            },
          }}
        >
          {/* Left: chat history */}
          <ChatHistoryPanel
            sessions={ai.sessions}
            activeId={ai.activeId}
            onSelect={ai.selectChat}
            onNew={ai.newChat}
            onDelete={ai.deleteChat}
            disabled={ai.isRunning}
          />

          {/* Right: chat column */}
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Scrollable thread */}
            <Box sx={{ flex: 1, overflow: "auto", pr: 0.5 }}>
              <Stack spacing={2.5}>
                {showSetup ? (
                  <Box sx={{ flexShrink: 0 }}>
                    <AiSettingsCard />
                  </Box>
                ) : null}

                <Box sx={{ flexShrink: 0 }}>
                  <PresetGrid onRun={ai.runIntent} disabled={locked} />
                </Box>

                {ai.messages.length === 0 && !ai.isRunning ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ flexShrink: 0, textAlign: "center", py: 4 }}
                  >
                    Pick a card above or type a question to begin.
                  </Typography>
                ) : null}

                {ai.messages.map((m) =>
                  m.role === "user" ? (
                    <Box
                      key={m.id}
                      sx={{
                        flexShrink: 0,
                        alignSelf: "flex-end",
                        maxWidth: "80%",
                        px: 2,
                        py: 1.25,
                        borderRadius: "16px 16px 4px 16px",
                        backgroundColor: (t) => t.palette.primary.main,
                        color: (t) => t.palette.primary.contrastText,
                      }}
                    >
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {m.text}
                      </Typography>
                    </Box>
                  ) : (
                    <AiResult key={m.id} message={m} />
                  ),
                )}

                {ai.error ? (
                  <Alert severity="error" sx={{ flexShrink: 0 }}>
                    {ai.error.message}
                  </Alert>
                ) : null}
              </Stack>
            </Box>

            {/* Bottom: animation + input */}
            <Box sx={{ flexShrink: 0, pt: 2 }}>
              <GradientBar active={ai.isRunning} />
              <Box sx={{ mt: 1 }}>
                <AiInputBar
                  value={ai.question}
                  onChange={ai.setQuestion}
                  onSubmit={ai.submitCustom}
                  disabled={!ai.isConfigured}
                  running={ai.isRunning}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
