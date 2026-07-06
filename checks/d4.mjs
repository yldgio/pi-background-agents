/** D4 — status transitions running -> done over a short run. */
import { fakeRegistry } from "./_helpers.mjs";

const reg = fakeRegistry({ resolveAfterMs: 250 });
const agent = { name: "quick", description: "d", systemPrompt: "", source: "user", filePath: "" };

const seq = [];
const runId = reg.launch({ agent, task: "go" });
seq.push(reg.status(runId).status); // expect running
await reg.waitIdle(runId);
seq.push(reg.status(runId).status); // expect done

console.log(JSON.stringify({ runId, seq }, null, 2));

let ok = true;
if (seq[0] !== "running") { console.error(`FAIL: first status ${seq[0]} != running`); ok = false; }
if (seq[1] !== "done") { console.error(`FAIL: terminal status ${seq[1]} != done`); ok = false; }
await reg.disposeAll();
if (!ok) process.exit(1);
console.log("D4 PASS");
