import { invoke } from "@shared/api";
import type { PublicCredentials } from "../model/types";

export const sessionApi = {
  loadCredentials: () => invoke<PublicCredentials>("load_credentials"),
  connectWithSaved: () => invoke<PublicCredentials>("connect_with_saved"),
  clearCredentials: () => invoke<void>("clear_credentials"),
};
