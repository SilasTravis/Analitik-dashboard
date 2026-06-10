import { useMemo } from "react";
import {
  Box,
  Button,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import type { ChatSession } from "@entities/ai";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

type Props = {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
};

export function ChatHistoryPanel({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  disabled,
}: Props) {
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  return (
    <Box
      sx={{
        width: 264,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRadius: "16px",
        overflow: "hidden",
        border: (t) =>
          t.palette.mode === "light"
            ? "1px solid rgba(15,23,42,0.08)"
            : "1px solid rgba(255,255,255,0.08)",
        backgroundColor: (t) =>
          t.palette.mode === "light" ? "rgba(255,255,255,0.4)" : "rgba(15,23,42,0.3)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Box sx={{ p: 1.5 }}>
        <Button
          fullWidth
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={onNew}
          disabled={disabled}
          sx={{ borderRadius: "12px", textTransform: "none", fontWeight: 600 }}
        >
          New chat
        </Button>
      </Box>

      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ px: 2, pt: 0.5, pb: 0.5, letterSpacing: 1 }}
      >
        History
      </Typography>

      <Box sx={{ flex: 1, overflow: "auto", px: 1, pb: 1 }}>
        {sorted.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ py: 5, px: 2, textAlign: "center" }}>
            <ChatBubbleOutlineRoundedIcon color="disabled" />
            <Typography variant="caption" color="text.secondary">
              Your chats will appear here.
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={0.5}>
            {sorted.map((s) => {
              const active = s.id === activeId;
              return (
                <Box
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  sx={{
                    position: "relative",
                    cursor: "pointer",
                    borderRadius: "10px",
                    px: 1.5,
                    py: 1,
                    transition: "background-color 120ms",
                    backgroundColor: (t) =>
                      active
                        ? t.palette.mode === "light"
                          ? "rgba(99,102,241,0.12)"
                          : "rgba(129,140,248,0.18)"
                        : "transparent",
                    "&:hover": {
                      backgroundColor: (t) =>
                        active
                          ? t.palette.mode === "light"
                            ? "rgba(99,102,241,0.16)"
                            : "rgba(129,140,248,0.22)"
                          : t.palette.mode === "light"
                            ? "rgba(15,23,42,0.05)"
                            : "rgba(255,255,255,0.06)",
                    },
                    "&:hover .chat-del": { opacity: 1 },
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontWeight: active ? 700 : 500, pr: 3 }}
                  >
                    {s.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {relativeTime(s.updatedAt)}
                  </Typography>
                  <Tooltip title="Delete chat">
                    <IconButton
                      className="chat-del"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(s.id);
                      }}
                      sx={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        opacity: 0,
                        transition: "opacity 120ms",
                      }}
                    >
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
