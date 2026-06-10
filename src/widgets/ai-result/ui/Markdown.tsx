import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Box,
  Divider,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

/** Render AI markdown (tables, lists, headings, code) with MUI styling. */
function MarkdownImpl({ children }: { children: string }) {
  return (
    <Box
      sx={{
        "& > :first-of-type": { mt: 0 },
        "& > :last-child": { mb: 0 },
        lineHeight: 1.7,
        wordBreak: "break-word",
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <Typography variant="h6" fontWeight={700} sx={{ mt: 2, mb: 1 }}>
              {children}
            </Typography>
          ),
          h2: ({ children }) => (
            <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 2, mb: 1 }}>
              {children}
            </Typography>
          ),
          h3: ({ children }) => (
            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1.5, mb: 0.5 }}>
              {children}
            </Typography>
          ),
          p: ({ children }) => (
            <Typography variant="body1" sx={{ my: 1, lineHeight: 1.7 }}>
              {children}
            </Typography>
          ),
          ul: ({ children }) => (
            <Box component="ul" sx={{ my: 1, pl: 3 }}>
              {children}
            </Box>
          ),
          ol: ({ children }) => (
            <Box component="ol" sx={{ my: 1, pl: 3 }}>
              {children}
            </Box>
          ),
          li: ({ children }) => (
            <Typography component="li" variant="body1" sx={{ mb: 0.5, lineHeight: 1.6 }}>
              {children}
            </Typography>
          ),
          a: ({ href, children }) => (
            <Link href={href} target="_blank" rel="noreferrer">
              {children}
            </Link>
          ),
          strong: ({ children }) => (
            <Box component="strong" sx={{ fontWeight: 700 }}>
              {children}
            </Box>
          ),
          hr: () => <Divider sx={{ my: 1.5 }} />,
          blockquote: ({ children }) => (
            <Box
              sx={{
                borderLeft: (t) => `3px solid ${t.palette.divider}`,
                pl: 1.5,
                my: 1,
                color: "text.secondary",
              }}
            >
              {children}
            </Box>
          ),
          code: ({ children, ...props }) => {
            const inline = !String(props.className ?? "").includes("language-");
            if (inline) {
              return (
                <Box
                  component="code"
                  sx={{
                    px: 0.5,
                    py: 0.1,
                    borderRadius: "4px",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "0.85em",
                    backgroundColor: (t) =>
                      t.palette.mode === "light"
                        ? "rgba(15,23,42,0.06)"
                        : "rgba(255,255,255,0.08)",
                  }}
                >
                  {children}
                </Box>
              );
            }
            return (
              <Box
                component="pre"
                sx={{
                  m: "8px 0",
                  p: 1.5,
                  borderRadius: "10px",
                  overflow: "auto",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12.5,
                  backgroundColor: (t) =>
                    t.palette.mode === "light"
                      ? "rgba(15,23,42,0.04)"
                      : "rgba(255,255,255,0.05)",
                }}
              >
                <code>{children}</code>
              </Box>
            );
          },
          table: ({ children }) => (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ my: 1.5, borderRadius: "12px", background: "transparent" }}
            >
              <Table size="small">{children}</Table>
            </TableContainer>
          ),
          thead: ({ children }) => <TableHead>{children}</TableHead>,
          tbody: ({ children }) => <TableBody>{children}</TableBody>,
          tr: ({ children }) => <TableRow>{children}</TableRow>,
          th: ({ children }) => (
            <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{children}</TableCell>
          ),
          td: ({ children }) => <TableCell>{children}</TableCell>,
        }}
      >
        {children}
      </ReactMarkdown>
    </Box>
  );
}

export const Markdown = memo(MarkdownImpl);
