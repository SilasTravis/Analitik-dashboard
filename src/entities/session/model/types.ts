export type PublicCredentials = {
  host: string;
  port: number;
  user: string;
  database: string;
  ssl: boolean;
  acceptInvalidCerts: boolean;
};

export type Session = {
  credentials: PublicCredentials;
};
