import { invoke } from "@shared/api";
import type { PublicCredentials } from "@entities/session";
import type { LoginPayload } from "../model/types";

export const authApi = {
  testConnection: (creds: LoginPayload) =>
    invoke<void>("test_connection", { creds }),
  saveCredentials: (creds: LoginPayload) =>
    invoke<PublicCredentials>("save_credentials", { creds }),
};
