/** D3 — launch is non-blocking: returns a runId promptly even when session
 * creation is slow, and status is `running` immediately. */
import { fakeRegistry } from "./_helpers.mjs";

const reg = fakeRegistry({ createDelayMs: 500, resolveAfterMs: null });
const agent = { name: "slow", description: "d", systemPrompt: "", source: "user", filePath: "" };

const t0 = Date.now();
const runId = reg.launch({ agent, task: "go" });
const launchMs = Date.now() - t0;
const st = reg.status(runId);

console.log(JSON.stringify({ runId, launchMs, status: st.status }, null, 2));

let ok = true;
if (launchMs >= 200) { console.error(`FAIL: launch took ${launchMs}ms (>=200)`); ok = false; }
if (st.status !== "running") { console.error(`FAIL: status ${st.status} != running`); ok = false; }
if (!runId.startsWith("slow-")) { console.error("FAIL: runId format"); ok = false; }
await reg.disposeAll();
if (!ok) process.exit(1);
console.log("D3 PASS");
