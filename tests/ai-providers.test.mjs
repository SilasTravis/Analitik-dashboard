import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadProviders() {
  const source = await readFile(
    new URL("../src/entities/ai/model/providers.ts", import.meta.url),
    "utf8",
  );
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
}

test("Claude is available as a direct Anthropic provider without replacing existing providers", async () => {
  const { AI_PROVIDERS, getProvider } = await loadProviders();

  assert.deepEqual(
    AI_PROVIDERS.map((provider) => provider.id),
    ["gemini", "openai", "anthropic"],
  );
  assert.deepEqual(getProvider("anthropic"), {
    id: "anthropic",
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-5",
    fallbackModels: [
      "claude-sonnet-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-haiku-4-5",
    ],
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "Anthropic Console",
  });
});
