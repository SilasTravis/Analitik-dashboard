import { FormControlLabel, Stack, Switch } from "@mui/material";
import { FormField } from "@shared/ui/form-field";
import type { LoginFormValues } from "../model/types";
import type { FieldErrors } from "../model/validate";

type Props = {
  values: LoginFormValues;
  errors: FieldErrors;
  setField: <K extends keyof LoginFormValues>(key: K, val: LoginFormValues[K]) => void;
};

export function LoginFields({ values, errors, setField }: Props) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2}>
        <FormField
          label="Host"
          value={values.host}
          onChange={(e) => setField("host", e.target.value)}
          error={Boolean(errors.host)}
          helperText={errors.host}
          autoFocus
        />
        <FormField
          label="Port"
          value={values.port}
          onChange={(e) => setField("port", e.target.value)}
          error={Boolean(errors.port)}
          helperText={errors.port}
          sx={{ maxWidth: 120 }}
        />
      </Stack>

      <FormField
        label="Database"
        value={values.database}
        onChange={(e) => setField("database", e.target.value)}
        error={Boolean(errors.database)}
        helperText={errors.database}
      />

      <FormField
        label="User"
        value={values.user}
        onChange={(e) => setField("user", e.target.value)}
        error={Boolean(errors.user)}
        helperText={errors.user}
        autoComplete="username"
      />

      <FormField
        label="Password"
        type="password"
        value={values.password}
        onChange={(e) => setField("password", e.target.value)}
        autoComplete="current-password"
      />

      <FormControlLabel
        control={
          <Switch
            checked={values.ssl}
            onChange={(e) => setField("ssl", e.target.checked)}
          />
        }
        label="Require SSL"
      />
    </Stack>
  );
}
