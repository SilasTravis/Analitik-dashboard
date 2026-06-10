import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Link,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import EditIcon from "@mui/icons-material/Edit";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { aiApi, AI_PROVIDERS, getProvider } from "@entities/ai";
import { useAiSettings } from "../model/use-ai-settings";

export function AiSettingsCard() {
  const { settings, isConfigured, save, saving, saveError, clear, clearing, clearError } =
    useAiSettings();

  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<string>("gemini");
  const [model, setModel] = useState<string>(getProvider("gemini").defaultModel);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [models, setModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const info = getProvider(provider);
  const providerChanged = isConfigured && settings?.provider !== provider;
  // The stored key only matches its own provider; switching providers needs a new key.
  const keyRequired = !isConfigured || providerChanged;

  // Seed edit fields from saved settings whenever we enter edit mode.
  const beginEdit = () => {
    const p = settings?.provider ?? "gemini";
    setProvider(p);
    setModel(settings?.model || getProvider(p).defaultModel);
    setApiKey("");
    setShowKey(false);
    setModels(null);
    setModelsError(null);
    setEditing(true);
  };

  // First-time setup (no saved key) starts directly in edit mode.
  useEffect(() => {
    if (!isConfigured) {
      setEditing(true);
      setProvider((prev) => prev || "gemini");
    }
  }, [isConfigured]);

  const canFetch = !!apiKey.trim() || (isConfigured && settings?.provider === provider);

  const fetchModels = (key?: string) => {
    if (!canFetch && !key) return;
    setLoadingModels(true);
    setModelsError(null);
    aiApi
      .listModels(provider, key)
      .then((list) => {
        if (list.length) setModels(list);
      })
      .catch((e: { message?: string }) =>
        setModelsError(e?.message ?? "Failed to load models"),
      )
      .finally(() => setLoadingModels(false));
  };

  // Auto-load the live list when editing and a usable key exists for this provider.
  useEffect(() => {
    if (editing && canFetch) fetchModels(apiKey.trim() || undefined);
    else setModels(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, provider]);

  // Always keep the curated (fallback) models — newer models like the GPT-5
  // family aren't returned by the live /models API yet — then add live models
  // and the currently selected one.
  const options = useMemo(
    () =>
      Array.from(
        new Set([
          ...info.fallbackModels,
          ...(models ?? []),
          ...(model ? [model] : []),
        ]),
      ),
    [models, info.fallbackModels, model],
  );

  const onProviderChange = (next: string) => {
    setProvider(next);
    setModel(getProvider(next).defaultModel);
    setModels(null);
    // A key from a different provider won't work, so clear it on switch.
    if (settings?.provider !== next) setApiKey("");
  };

  const canSave = (!keyRequired || apiKey.trim().length > 0) && !saving;

  const onSave = () => {
    if (!canSave) return;
    void save({
      provider,
      api_key: apiKey.trim(),
      model: model.trim() || null,
    }).then(() => {
      setApiKey("");
      setShowKey(false);
      setEditing(false);
    });
  };

  const onCancel = () => {
    setApiKey("");
    setShowKey(false);
    setEditing(false);
  };

  const onDisconnect = () => {
    void clear().then(() => {
      setApiKey("");
      setEditing(false);
    });
  };

  const header = (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <AutoAwesomeIcon color="primary" />
        <Typography variant="h6" fontWeight={700}>
          AI Assistant
        </Typography>
      </Stack>
      <Chip
        size="small"
        label={isConfigured ? "Connected" : "Not configured"}
        color={isConfigured ? "success" : "default"}
        variant={isConfigured ? "filled" : "outlined"}
      />
    </Stack>
  );

  // ── View mode: configured & not editing → masked summary, no input fields ──
  if (isConfigured && !editing) {
    const savedInfo = getProvider(settings?.provider);
    return (
      <Card sx={{ flexShrink: 0 }}>
        <CardContent sx={{ p: 3 }}>
          {header}
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Row label="Provider" value={savedInfo.label} />
            <Row label="Model" value={settings?.model || savedInfo.defaultModel} />
            <Row label="API key" value="•••••••••••••••• stored" mono />
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<EditIcon fontSize="small" />}
                onClick={beginEdit}
                sx={{ borderRadius: 2 }}
              >
                Edit
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  // ── Edit / first-time setup mode ──
  return (
    <Card sx={{ flexShrink: 0 }}>
      <CardContent sx={{ p: 3 }}>
        {header}
        <Divider sx={{ mb: 2 }} />
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Choose a provider and model for the AI Scanner. Your API key is stored
            encrypted on this device and never leaves it except to call the provider.
          </Typography>

          <TextField
            label="Provider"
            select
            size="small"
            fullWidth
            value={provider}
            onChange={(e) => onProviderChange(e.target.value)}
          >
            {AI_PROVIDERS.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <TextField
              label="Model"
              select
              size="small"
              fullWidth
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {options.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
            <Tooltip title="Fetch the live model list from the provider">
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => fetchModels(apiKey.trim() || undefined)}
                  disabled={loadingModels || !canFetch}
                  startIcon={
                    loadingModels ? <CircularProgress size={14} /> : <RefreshIcon />
                  }
                  sx={{ borderRadius: 2, whiteSpace: "nowrap", mt: 0.25 }}
                >
                  Refresh
                </Button>
              </span>
            </Tooltip>
          </Stack>
          {modelsError ? (
            <Typography variant="caption" color="error">
              {modelsError}
            </Typography>
          ) : null}

          <TextField
            label={keyRequired ? `${info.label} API key` : "Replace API key (leave blank to keep)"}
            type={showKey ? "text" : "password"}
            size="small"
            fullWidth
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keyRequired ? undefined : "••••••••••••••••"}
            autoComplete="off"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setShowKey((v) => !v)}
                    edge="end"
                    aria-label={showKey ? "Hide key" : "Show key"}
                  >
                    {showKey ? (
                      <VisibilityOffIcon fontSize="small" />
                    ) : (
                      <VisibilityIcon fontSize="small" />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          {providerChanged ? (
            <Typography variant="caption" color="text.secondary">
              Switching provider — enter an API key for {info.label}.
            </Typography>
          ) : null}

          {saveError ? <Alert severity="error">{saveError.message}</Alert> : null}
          {clearError ? <Alert severity="error">{clearError.message}</Alert> : null}

          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap" }}>
            <Button
              variant="contained"
              disabled={!canSave}
              onClick={onSave}
              sx={{ borderRadius: 2 }}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            {isConfigured ? (
              <Button variant="text" onClick={onCancel} sx={{ borderRadius: 2 }}>
                Cancel
              </Button>
            ) : null}
            <Box sx={{ flexGrow: 1 }} />
            {isConfigured ? (
              <Button
                variant="outlined"
                color="error"
                disabled={clearing}
                onClick={onDisconnect}
                sx={{ borderRadius: 2 }}
              >
                {clearing ? "Removing…" : "Disconnect"}
              </Button>
            ) : (
              <Link href={info.keyUrl} target="_blank" rel="noreferrer" variant="body2">
                Get a key ({info.keyHint})
              </Link>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={mono ? { fontFamily: "monospace", letterSpacing: 1 } : undefined}
      >
        {value}
      </Typography>
    </Stack>
  );
}
