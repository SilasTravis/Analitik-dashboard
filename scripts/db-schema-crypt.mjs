// Encrypt / decrypt the private database schema (`db.json`) so it can live in a
// public repo as an opaque `db.json.enc` blob and be restored during CI.
//
//   DB_JSON_KEY=<passphrase> node scripts/db-schema-crypt.mjs encrypt
//   DB_JSON_KEY=<passphrase> node scripts/db-schema-crypt.mjs decrypt
//
// `encrypt` reads db.json -> writes db.json.enc (commit this).
// `decrypt` reads db.json.enc -> writes db.json (run in CI before the build).
//
// Uses AES-256-GCM with a scrypt-derived key. The blob layout is:
//   base64( salt[16] | iv[12] | authTag[16] | ciphertext )
// Only Node built-ins are used, so it runs on macOS, Windows, and Linux runners.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAIN = resolve(ROOT, "db.json");
const ENC = resolve(ROOT, "db.json.enc");

const mode = process.argv[2];
const key = process.env.DB_JSON_KEY;

const deriveKey = (passphrase, salt) => scryptSync(passphrase, salt, 32);

if (mode === "encrypt") {
  if (!key) {
    console.error("DB_JSON_KEY env var is required to encrypt.");
    process.exit(1);
  }
  if (!existsSync(PLAIN)) {
    console.error(`Missing ${PLAIN} — nothing to encrypt.`);
    process.exit(1);
  }
  const plaintext = readFileSync(PLAIN);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(key, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([salt, iv, tag, ciphertext]).toString("base64");
  writeFileSync(ENC, blob);
  console.log(`Encrypted db.json -> db.json.enc (${blob.length} base64 chars).`);
} else if (mode === "decrypt") {
  if (!existsSync(ENC)) {
    console.warn("db.json.enc not found; skipping (app will use runtime introspection).");
    process.exit(0);
  }
  if (!key) {
    console.warn("DB_JSON_KEY not set; skipping decrypt (app will use runtime introspection).");
    process.exit(0);
  }
  const blob = Buffer.from(readFileSync(ENC, "utf8"), "base64");
  const salt = blob.subarray(0, 16);
  const iv = blob.subarray(16, 28);
  const tag = blob.subarray(28, 44);
  const ciphertext = blob.subarray(44);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(key, salt), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  writeFileSync(PLAIN, plaintext);
  console.log(`Decrypted db.json.enc -> db.json (${plaintext.length} bytes).`);
} else {
  console.error("Usage: node scripts/db-schema-crypt.mjs <encrypt|decrypt>");
  process.exit(1);
}
