import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSessionStore } from "@entities/session";
import type { BackendError } from "@shared/api";
import { authApi } from "../api/auth.api";
import { parsePostgresUrl } from "./parse-url";
import type { LoginFormValues, LoginMode, LoginPayload } from "./types";
import { defaultLoginValues } from "./types";
import { validate, type FieldErrors } from "./validate";

function fieldsToPayload(values: LoginFormValues, acceptInvalidCerts: boolean): LoginPayload {
  return {
    host: values.host.trim(),
    port: Number(values.port),
    user: values.user.trim(),
    password: values.password,
    database: values.database.trim(),
    ssl: values.ssl,
    acceptInvalidCerts,
  };
}

export function useLogin() {
  const [mode, setMode] = useState<LoginMode>("fields");
  const [values, setValues] = useState<LoginFormValues>(defaultLoginValues);
  const [url, setUrl] = useState("");
  const [acceptInvalidCerts, setAcceptInvalidCerts] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [urlError, setUrlError] = useState<string | null>(null);
  const setSession = useSessionStore((s) => s.setSession);

  const mutation = useMutation({
    mutationFn: (payload: LoginPayload) => authApi.saveCredentials(payload),
    onSuccess: (creds) => setSession(creds),
  });

  const setField = <K extends keyof LoginFormValues>(key: K, val: LoginFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const changeMode = (next: LoginMode) => {
    setMode(next);
    setErrors({});
    setUrlError(null);
    mutation.reset();
  };

  const changeUrl = (next: string) => {
    setUrl(next);
    if (urlError) setUrlError(null);
  };

  const submit = async () => {
    let payload: LoginPayload;
    if (mode === "url") {
      try {
        payload = { ...parsePostgresUrl(url), acceptInvalidCerts };
      } catch (e) {
        setUrlError((e as Error).message);
        return;
      }
    } else {
      const next = validate(values);
      setErrors(next);
      if (Object.keys(next).length > 0) return;
      payload = fieldsToPayload(values, acceptInvalidCerts);
    }
    try {
      await mutation.mutateAsync(payload);
    } catch {
      /* handled via mutation.error */
    }
  };

  return {
    mode,
    setMode: changeMode,
    values,
    setField,
    url,
    setUrl: changeUrl,
    acceptInvalidCerts,
    setAcceptInvalidCerts,
    errors,
    urlError,
    submit,
    isSubmitting: mutation.isPending,
    error: mutation.error as BackendError | null,
  };
}
