// Credential storage shared with the MisarPost MCP stdio server: the same file
// (~/.misarpost/config.json, mode 0600) and the same keys (`api_key`,
// `base_url`), so `misarpost login` also signs in `npx @misarpost/mcp`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_BASE_URL = "https://api.misar.io/post";

export function configPath(env = process.env) {
  return join(env.HOME || env.USERPROFILE || homedir(), ".misarpost", "config.json");
}

/** @returns {{ api_key?: string, base_url?: string }} */
export function loadConfig(env = process.env) {
  try {
    return JSON.parse(readFileSync(configPath(env), "utf8"));
  } catch {
    return {};
  }
}

/** Merge-write the config (undefined drops a field). */
export function saveConfig(patch, env = process.env) {
  const path = configPath(env);
  mkdirSync(join(path, ".."), { recursive: true });
  const merged = { ...loadConfig(env), ...patch };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  writeFileSync(path, JSON.stringify(merged, null, 2), { mode: 0o600 });
  return path;
}

/** Key precedence: --api-key > MISARPOST_API_KEY > config file. */
export function resolveApiKey(flags, env = process.env) {
  return flags["api-key"] || env.MISARPOST_API_KEY?.trim() || loadConfig(env).api_key || null;
}

/** Base URL precedence: --base-url > MISARPOST_BASE_URL > config > default. */
export function resolveBaseUrl(flags, env = process.env) {
  return (flags["base-url"] || env.MISARPOST_BASE_URL?.trim() || loadConfig(env).base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
}
