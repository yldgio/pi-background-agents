/** D7c — collect via the tool on a running agent returns promptly with a
 * "still running" message (non-blocking). */
import { fakeRegistry, toolDeps } from "./_helpers.mjs";
import { runAction } from "../tool.ts";

const reg = fakeRegistry({ resolveAfterMs: null });
const agent = { name: "runner", description: "d", systemPrompt: "", source: "user", filePath: "" };
const deps = toolDeps(reg, agent);

const launched = await runAction(deps, { action: "launch", agent: "runner", task: "go" });
const runId = launched.content[0].text.match(/as (runner-\d+)/)[1];

const t0 = Date.now();
const collected = await runAction(deps, { action: "collect", runId });
const collectMs = Date.now() - t0;
const raw = reg.collect(runId);

console.log(JSON.stringify({ runId, collectMs, done: raw.done, msg: collected.content[0].text.slice(0, 80) }, null, 2));

let ok = true;
if (raw.done !== false) { console.error("FAIL: done should be false while running"); ok = false; }
if (!/still running/.test(collected.content[0].text)) { console.error("FAIL: missing still-running message"); ok = false; }
if (collectMs >= 50) { console.error(`FAIL: collect blocked ${collectMs}ms`); ok = false; }
await reg.disposeAll();
if (!ok) process.exit(1);
console.log("D7c PASS");
