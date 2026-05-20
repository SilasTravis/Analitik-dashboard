import type { LoginPayload } from "./types";

/**
 * Parse a Postgres connection URL into a LoginPayload.
 * Accepts: postgresql://user:password@host:port/database?sslmode=require
 *          postgres://...
 * Throws Error with a friendly message on bad input.
 */
export function parsePostgresUrl(input: string): LoginPayload {
  const raw = input.trim();
  if (!raw) throw new Error("Connection URL is empty");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Not a valid URL");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("URL must start with postgres:// or postgresql://");
  }

  const host = url.hostname;
  if (!host) throw new Error("Host is missing");

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("Database name is missing");

  const user = decodeURIComponent(url.username);
  if (!user) throw new Error("User is missing");

  const password = decodeURIComponent(url.password);
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error("Port must be 1–65535");
  }

  const sslmode = url.searchParams.get("sslmode")?.toLowerCase() ?? "";
  const ssl = sslmode === "require" || sslmode === "verify-full" || sslmode === "verify-ca";

  // Default false here; the UI carries the user's opt-in and overrides it.
  return { host, port, user, password, database, ssl, acceptInvalidCerts: false };
}
