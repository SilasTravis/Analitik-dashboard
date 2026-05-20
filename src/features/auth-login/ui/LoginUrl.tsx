import { Stack, Typography } from "@mui/material";
import { FormField } from "@shared/ui/form-field";

type Props = {
  value: string;
  error: string | null;
  onChange: (next: string) => void;
};

export function LoginUrl({ value, error, onChange }: Props) {
  return (
    <Stack spacing={1.5}>
      <FormField
        label="Connection URL"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={Boolean(error)}
        helperText={error ?? "We never log or transmit this — it's stored in your macOS Keychain."}
        placeholder="postgresql://user:password@host:5432/database?sslmode=require"
        autoFocus
        multiline
        minRows={2}
        InputProps={{
          sx: {
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            fontSize: 13,
          },
        }}
      />
      <Typography variant="caption" color="text.secondary">
        Tip: append <code>?sslmode=require</code> for managed Postgres providers
        (Supabase, Neon, RDS).
      </Typography>
    </Stack>
  );
}
