// Upgrade card for a plan refusal. Every word comes from the server's offer —
// the CLI is published, so nothing user-facing is baked in beyond layout.
function bar(used, limit, cells = 20) {
  const filled = Math.max(0, Math.min(cells, Math.round((used / Math.max(1, limit)) * cells)));
  return "█".repeat(filled) + "░".repeat(cells - filled);
}

export function renderUpgradeCard(err) {
  const o = err.offer ?? {};
  const lines = ["", `⛔  ${o.headline ?? err.message}`];
  if (o.usage && o.usage.limit != null) {
    lines.push(`    ${bar(o.usage.used ?? o.usage.limit, o.usage.limit)}  ${o.usage.used}/${o.usage.limit}${o.usage.resets_at ? `  · resets ${o.usage.resets_at.slice(0, 10)}` : ""}`);
  }
  if (o.current_plan?.name) lines.push(`    Current plan: ${o.current_plan.name}`);
  for (const p of o.plans ?? []) {
    lines.push(`    ${p.recommended ? "★" : "•"} ${p.name} — ${p.price}${p.unlocks ? `  (${p.unlocks})` : ""}`);
  }
  if (o.cta) lines.push(`    ${o.cta}`);
  const url = err.upgradeUrl ?? o.urls?.pricing;
  if (url) lines.push(`    ${url}`);
  return lines.join("\n") + "\n";
}
