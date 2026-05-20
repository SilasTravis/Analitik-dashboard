import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { PanelSwitcher } from "@shared/ui/panel-switcher";
import { useLogin } from "../model/use-login";
import { AdvancedOptions } from "./AdvancedOptions";
import { LoginFields } from "./LoginFields";
import { LoginUrl } from "./LoginUrl";
import { ModeToggle } from "./ModeToggle";

export function LoginForm() {
  const {
    mode,
    setMode,
    values,
    setField,
    url,
    setUrl,
    acceptInvalidCerts,
    setAcceptInvalidCerts,
    errors,
    urlError,
    submit,
    isSubmitting,
    error,
  } = useLogin();

  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Stack spacing={2.5}>
        <Stack spacing={0.75}>
          <Typography variant="h5" fontWeight={700}>
            Connect your database
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Use a connection URL or fill in fields manually. Credentials are stored
            securely in your macOS Keychain.
          </Typography>
        </Stack>

        <ModeToggle value={mode} onChange={setMode} />

        <PanelSwitcher
          active={mode}
          panels={[
            {
              key: "url",
              content: <LoginUrl value={url} error={urlError} onChange={setUrl} />,
            },
            {
              key: "fields",
              content: <LoginFields values={values} errors={errors} setField={setField} />,
            },
          ]}
        />

        <AdvancedOptions
          acceptInvalidCerts={acceptInvalidCerts}
          onChangeAcceptInvalidCerts={setAcceptInvalidCerts}
        />

        {error ? <Alert severity="error">{error.message}</Alert> : null}

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isSubmitting}
          sx={{ borderRadius: 2, py: 1.25, textTransform: "none", fontWeight: 600 }}
        >
          {isSubmitting ? "Connecting…" : "Connect"}
        </Button>
      </Stack>
    </Box>
  );
}
