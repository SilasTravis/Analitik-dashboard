import type { LoginFormValues } from "./types";

export type FieldErrors = Partial<Record<keyof LoginFormValues, string>>;

export function validate(values: LoginFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.host.trim()) errors.host = "Host is required";
  const port = Number(values.port);
  if (!values.port.trim() || Number.isNaN(port) || port <= 0 || port > 65535) {
    errors.port = "Port must be 1–65535";
  }
  if (!values.user.trim()) errors.user = "User is required";
  if (!values.database.trim()) errors.database = "Database is required";
  return errors;
}
