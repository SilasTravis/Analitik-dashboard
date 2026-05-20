import { Box, CircularProgress } from "@mui/material";

export function PageSpinner() {
  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 240,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress size={28} />
    </Box>
  );
}
