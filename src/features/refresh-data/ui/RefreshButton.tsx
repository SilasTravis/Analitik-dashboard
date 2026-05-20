import { useState } from "react";
import RefreshIcon from "@mui/icons-material/Refresh";
import { IconButton, Tooltip } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { analyticsKeys } from "@entities/analytics";

/**
 * Invalidates all analytics queries and spins the icon while refetching.
 * The current page's visible widgets refetch automatically.
 */
export function RefreshButton() {
  const qc = useQueryClient();
  const [spinning, setSpinning] = useState(false);

  const refresh = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      await qc.invalidateQueries({ queryKey: analyticsKeys.all });
    } finally {
      // Keep the spin going briefly so the user perceives the refresh.
      setTimeout(() => setSpinning(false), 450);
    }
  };

  return (
    <Tooltip title="Refresh data">
      <IconButton size="small" onClick={refresh} aria-label="Refresh data">
        <RefreshIcon
          fontSize="small"
          sx={{
            transition: "transform 450ms cubic-bezier(0.4, 0, 0.2, 1)",
            transform: spinning ? "rotate(360deg)" : "rotate(0deg)",
          }}
        />
      </IconButton>
    </Tooltip>
  );
}
