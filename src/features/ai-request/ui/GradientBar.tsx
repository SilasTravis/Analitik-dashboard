import { Box } from "@mui/material";

type Props = { active: boolean };

/** Animated gradient strip shown at the page bottom while the AI is working. */
export function GradientBar({ active }: Props) {
  return (
    <Box
      sx={{
        height: active ? 4 : 0,
        opacity: active ? 1 : 0,
        transition: "height 220ms ease, opacity 220ms ease",
        borderRadius: 999,
        background:
          "linear-gradient(90deg, #6366f1, #ec4899, #f59e0b, #10b981, #6366f1)",
        backgroundSize: "300% 100%",
        animation: active ? "ai-gradient-flow 1.4s linear infinite" : "none",
        "@keyframes ai-gradient-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "300% 50%" },
        },
      }}
    />
  );
}
