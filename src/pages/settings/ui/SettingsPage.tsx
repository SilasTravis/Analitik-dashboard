import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  Divider,
  Stack,
  LinearProgress,
  Alert,
} from "@mui/material";
import { Sidebar } from "@widgets/sidebar";
import { Header } from "@widgets/header";
import { useSessionStore } from "@entities/session";
import { useUpdater } from "@features/updater";
import SecurityIcon from "@mui/icons-material/Security";
import CloudQueueIcon from "@mui/icons-material/CloudQueue";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InfoIcon from "@mui/icons-material/Info";

export function SettingsPage() {
  const session = useSessionStore((s) => s.session);
  const { state: updaterState, checkForUpdate, installUpdate } = useUpdater();
  const [currentVersion, setCurrentVersion] = useState("0.1.0");

  useEffect(() => {
    // Dynamically retrieve the current app version from the Tauri core process
    import("@tauri-apps/api/app").then((app) => {
      app.getVersion().then((v) => setCurrentVersion(v));
    }).catch(() => {
      // Fallback if running in pure browser environment
      setCurrentVersion("0.1.0");
    });
  }, []);

  const renderUpdaterContent = () => {
    switch (updaterState.type) {
      case "idle":
        return (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Check if there is a newer version of the Analytics Dashboard.
            </Typography>
            <Button
              variant="outlined"
              size="medium"
              startIcon={<RefreshIcon />}
              onClick={checkForUpdate}
              sx={{ alignSelf: "flex-start", borderRadius: 2 }}
            >
              Check for Updates
            </Button>
          </Stack>
        );

      case "checking":
        return (
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Checking update server...
            </Typography>
          </Stack>
        );

      case "upToDate":
        return (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ color: "success.main" }}>
              <CheckCircleIcon fontSize="small" />
              <Typography variant="body2" fontWeight={600}>
                You're all set!
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Analitic Dashboard is up to date (version {updaterState.version}).
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={checkForUpdate}
              sx={{ alignSelf: "flex-start", borderRadius: 2 }}
            >
              Check Again
            </Button>
          </Stack>
        );

      case "available":
        return (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Version <strong>{updaterState.update.version}</strong> is available!
            </Alert>
            {updaterState.notes && (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: (t) => t.palette.mode === "light" ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(0,0,0,0.05)",
                }}
              >
                <Typography variant="caption" fontWeight={600} display="block" color="text.secondary">
                  Release Notes:
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                  {updaterState.notes}
                </Typography>
              </Box>
            )}
            <Button
              variant="contained"
              size="medium"
              onClick={() => installUpdate(updaterState.update)}
              sx={{ alignSelf: "flex-start", borderRadius: 2, textTransform: "none" }}
            >
              Download & Install Update
            </Button>
          </Stack>
        );

      case "downloading":
        return (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Typography variant="body2" fontWeight={600}>
              Downloading update...
            </Typography>
            <Box sx={{ width: "100%", display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ flexGrow: 1 }}>
                <LinearProgress variant="determinate" value={updaterState.progress} sx={{ borderRadius: 1, height: 6 }} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {updaterState.progress}%
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              The application will automatically restart once installation is complete.
            </Typography>
          </Stack>
        );

      case "error":
        return (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {updaterState.message}
            </Alert>
            <Button
              variant="outlined"
              size="small"
              onClick={checkForUpdate}
              sx={{ alignSelf: "flex-start", borderRadius: 2 }}
            >
              Try Again
            </Button>
          </Stack>
        );
    }
  };

  const creds = session?.credentials;

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Sidebar />
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Header title="Settings" subtitle="Manage your dashboard preferences and system updates" />
        
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            gap: 4,
            display: "flex",
            flexDirection: "column",
            p: 4,
            position: "relative",
            backgroundColor: (t) => t.palette.background.default,
            // Native macOS Tahoe translucent glass styling
            "& .MuiPaper-root": {
              borderRadius: "16px",
              background: (t) =>
                t.palette.mode === "light"
                  ? "linear-gradient(135deg, rgba(248, 250, 252, 0.55) 0%, rgba(241, 245, 249, 0.35) 100%)"
                  : "linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.3) 100%)",
              backdropFilter: "blur(24px) saturate(190%)",
              border: (t) =>
                t.palette.mode === "light"
                  ? "1px solid rgba(255, 255, 255, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: (t) =>
                t.palette.mode === "light"
                  ? "0 4px 30px rgba(0, 0, 0, 0.02), inset 0 1px 1px rgba(255, 255, 255, 0.8)"
                  : "0 4px 30px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
              transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
              position: "relative",
              overflow: "hidden",
              "&::after": {
                content: '""',
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.12), transparent 50%)",
                pointerEvents: "none",
              },
            },
          }}
        >
          {/* Settings Grid */}
          <Stack spacing={4}>
            
            {/* Updates Panel */}
            <Card sx={{ flexShrink: 0 }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                  <CloudQueueIcon color="primary" />
                  <Typography variant="h6" fontWeight={700}>
                    Software Updates
                  </Typography>
                </Stack>
                <Divider sx={{ mb: 2 }} />
                {renderUpdaterContent()}
              </CardContent>
            </Card>

            {/* Connection Information Panel */}
            <Card sx={{ flexShrink: 0 }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                  <SecurityIcon color="primary" />
                  <Typography variant="h6" fontWeight={700}>
                    Database Connection Details
                  </Typography>
                </Stack>
                <Divider sx={{ mb: 2 }} />
                {creds ? (
                  <Stack spacing={1.5} sx={{ mt: 1 }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Database Host</Typography>
                      <Typography variant="body2" fontWeight={600}>{creds.host}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Port</Typography>
                      <Typography variant="body2" fontWeight={600}>{creds.port}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Database Name</Typography>
                      <Typography variant="body2" fontWeight={600}>{creds.database}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Username</Typography>
                      <Typography variant="body2" fontWeight={600}>{creds.user}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">SSL Enabled</Typography>
                      <Typography variant="body2" fontWeight={600} color={creds.ssl ? "success.main" : "text.secondary"}>
                        {creds.ssl ? "Yes" : "No"}
                      </Typography>
                    </Stack>
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    No database credentials detected.
                  </Typography>
                )}
              </CardContent>
            </Card>

            {/* Application Information Panel */}
            <Card sx={{ flexShrink: 0 }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                  <InfoIcon color="primary" />
                  <Typography variant="h6" fontWeight={700}>
                    Application Information
                  </Typography>
                </Stack>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">App Version</Typography>
                    <Typography variant="body2" fontWeight={600}>{currentVersion}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Build Engine</Typography>
                    <Typography variant="body2" fontWeight={600}>Tauri Core v2.1</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Frontend framework</Typography>
                    <Typography variant="body2" fontWeight={600}>React + TypeScript + Material-UI</Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
