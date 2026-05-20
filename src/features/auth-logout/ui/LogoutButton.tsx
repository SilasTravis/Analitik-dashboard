import LogoutIcon from "@mui/icons-material/Logout";
import { IconButton, Tooltip } from "@mui/material";
import { useLogout } from "../model/use-logout";

export function LogoutButton() {
  const logout = useLogout();
  return (
    <Tooltip title="Disconnect">
      <span>
        <IconButton
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          size="small"
        >
          <LogoutIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}
