// misarpost — every MisarPost API endpoint as a command. The command table
// (src/generated/commands.json) is generated from the API's own route tree, so
// the CLI always matches the server.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DEFAULT_BASE_URL, configPath, loadConfig, resolveApiKey, resolveBaseUrl, saveConfig } from "./config.js";
import { ApiError, PlanLimitError, VERSION, paginate, request } from "./http.js";
import { renderUpgradeCard } from "./render.js";
import { verifyWebhookSignature } from "./webhooks.js";

const COMMANDS = JSON.parse(readFileSync(new URL("./generated/commands.json", import.meta.url), "utf8"));

const EXIT = { ok: 0, api: 1, planLimit: 2, usage: 64 };
const norm = (s) => String(s).toLowerCase().replace(/[-_]/g, "");

function findCommand(resource, method) {
  return COMMANDS.find((c) => norm(c.resource) === norm(resource) && (norm(c.method) === norm(method) || c.command === method));
}

function help(out, resource) {
  const rows = COMMANDS.filter((c) => !resource || norm(c.resource) === norm(resource));
  if (resource && rows.length === 0) return false;
  out.write(`misarpost ${VERSION} — MisarPost API from the terminal\n\n`);
  out.write("Usage: misarpost <resource> <command> [args…] [--body JSON|@file] [--query k=v …] [--all-pages]\n");
  out.write("       misarpost login --key mpk_…  |  logout  |  whoami\n");
  out.write("       misarpost webhooks verify --secret mpwh_… --signature sha256=… --file body.json\n\n");
  let last = "";
  for (const c of rows) {
    if (c.resourceKebab !== last) {
      out.write(`\n${c.resourceKebab}\n`);
      last = c.resourceKebab;
    }
    const args = [...c.pathParams, ...c.requiredQuery].map((a) => `<${a}>`).join(" ");
    out.write(`  ${c.command}${args ? " " + args : ""}${c.hasBody ? " --body …" : ""}\n      ${c.verb} ${c.path}  (scope ${c.scope})\n`);
  }
  out.write("\nAuth: --api-key, MISARPOST_API_KEY, or `misarpost login`. Docs: https://docs.misar.io/post\n");
  return true;
}

function readBody(value) {
  if (value === undefined) return undefined;
  const raw = value.startsWith("@") ? readFileSync(value.slice(1), "utf8") : value;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--body must be a JSON object");
  return parsed;
}

function readQuery(pairs) {
  const q = {};
  for (const pair of pairs ?? []) {
    const i = pair.indexOf("=");
    if (i < 1) throw new Error(`--query expects key=value, got "${pair}"`);
    q[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return q;
}

/**
 * Run the CLI. Returns the exit code; never calls process.exit, so tests can
 * drive it in-process.
 */
export async function main(argv, { env = process.env, stdout = process.stdout, stderr = process.stderr, fetchImpl } = {}) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        "api-key": { type: "string" },
        "base-url": { type: "string" },
        key: { type: "string" },
        body: { type: "string" },
        query: { type: "string", multiple: true },
        "all-pages": { type: "boolean" },
        json: { type: "boolean" },
        secret: { type: "string" },
        signature: { type: "string" },
        file: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return EXIT.usage;
  }
  const { values: flags, positionals } = parsed;
  const [first, second, ...rest] = positionals;

  if (flags.version) {
    stdout.write(`${VERSION}\n`);
    return EXIT.ok;
  }
  if (!first || flags.help || first === "help" || first === "resources") {
    const ok = help(stdout, first === "help" || first === "resources" ? second : undefined);
    return ok ? EXIT.ok : EXIT.usage;
  }

  if (first === "login") {
    const key = flags.key ?? second;
    if (!key || !key.startsWith("mpk_")) {
      stderr.write("Usage: misarpost login --key mpk_… (create one at https://post.misar.io/dashboard/api-keys)\n");
      return EXIT.usage;
    }
    const path = saveConfig({ api_key: key, base_url: flags["base-url"] }, env);
    stdout.write(`Saved key ${key.slice(0, 12)}… to ${path}\n`);
    return EXIT.ok;
  }
  if (first === "logout") {
    saveConfig({ api_key: undefined }, env);
    stdout.write(`Removed the key from ${configPath(env)}\n`);
    return EXIT.ok;
  }
  if (first === "whoami" || first === "status") {
    const key = resolveApiKey(flags, env);
    stdout.write(`key:      ${key ? key.slice(0, 12) + "…" : "(none)"}\nbase url: ${resolveBaseUrl(flags, env)}\nconfig:   ${configPath(env)}${loadConfig(env).api_key ? "" : " (no key stored)"}\n`);
    return key ? EXIT.ok : EXIT.api;
  }
  if (first === "webhooks" && second === "verify") {
    if (!flags.secret || !flags.signature || !flags.file) {
      stderr.write("Usage: misarpost webhooks verify --secret mpwh_… --signature sha256=… --file body.json\n");
      return EXIT.usage;
    }
    const ok = verifyWebhookSignature(flags.secret, readFileSync(flags.file), flags.signature);
    stdout.write(ok ? "valid\n" : "INVALID\n");
    return ok ? EXIT.ok : EXIT.api;
  }

  const cmd = second ? findCommand(first, second) : undefined;
  if (!cmd) {
    stderr.write(`Unknown command: ${[first, second].filter(Boolean).join(" ")}. Run \`misarpost help\`.\n`);
    return EXIT.usage;
  }
  const wanted = [...cmd.pathParams, ...cmd.requiredQuery];
  if (rest.length < wanted.length) {
    stderr.write(`Usage: misarpost ${cmd.resourceKebab} ${cmd.command} ${wanted.map((a) => `<${a}>`).join(" ")}\n`);
    return EXIT.usage;
  }

  const apiKey = resolveApiKey(flags, env);
  if (!apiKey) {
    stderr.write(
      "No MisarPost API key. Pass --api-key, set MISARPOST_API_KEY, or run `misarpost login --key mpk_…`.\n" +
        "Create one at https://post.misar.io/dashboard/api-keys\n",
    );
    return EXIT.api;
  }

  let body;
  let query;
  try {
    body = cmd.hasBody ? readBody(flags.body) ?? {} : undefined;
    query = readQuery(flags.query);
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return EXIT.usage;
  }
  let path = cmd.path;
  cmd.pathParams.forEach((p, i) => {
    path = path.replace(`:${p}`, encodeURIComponent(rest[i]));
  });
  cmd.requiredQuery.forEach((q, i) => {
    query[q] = rest[cmd.pathParams.length + i];
  });

  const call = (q) =>
    request({ apiKey, baseUrl: resolveBaseUrl(flags, env) || DEFAULT_BASE_URL, method: cmd.verb, path, query: q, body, fetchImpl });

  try {
    const result = flags["all-pages"] && cmd.verb === "GET" ? await paginate((page) => call({ ...query, page })) : await call(query);
    stdout.write(JSON.stringify(result, null, flags.json ? 0 : 2) + "\n");
    return EXIT.ok;
  } catch (err) {
    if (err instanceof PlanLimitError) {
      stderr.write(renderUpgradeCard(err));
      return EXIT.planLimit;
    }
    if (err instanceof ApiError) {
      stderr.write(`error (${err.status}, ${err.code}): ${err.message}\n`);
      return EXIT.api;
    }
    throw err;
  }
}
