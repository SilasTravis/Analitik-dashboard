export type LoginMode = "fields" | "url";

export type LoginFormValues = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
};

export type LoginPayload = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  acceptInvalidCerts: boolean;
};

export const defaultLoginValues: LoginFormValues = {
  host: "localhost",
  port: "5432",
  user: "",
  password: "",
  database: "",
  ssl: false,
};
