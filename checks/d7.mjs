/** D7 — stop via the tool disposes the agent (removed from registry). */
import { fakeRegistry, toolDeps } from "./_helpers.mjs";
import { runAction } from "../tool.ts";

const reg = fakeRegistry({ resolveAfterMs: null });
const agent = { name: "victim", description: "d", systemPrompt: "", source: "user", filePath: "" };
const deps = toolDeps(reg, agent);

const launched = await runAction(deps, { action: "launch", agent: "victim", task: "go" });
const runId = launched.content[0].text.match(/as (victim-\d+)/)[1];
const before = reg.has(runId);
const stopped = await runAction(deps, { action: "stop", runId });
const after = reg.has(runId);

console.log(JSON.stringify({ runId, before, after, sizeAfter: reg.size(), stopMsg: stopped.content[0].text }, null, 2));

let ok = true;
if (!before) { console.error("FAIL: not present before stop"); ok = false; }
if (after) { console.error("FAIL: still present after stop"); ok = false; }
if (reg.size() !== 0) { console.error("FAIL: registry not empty"); ok = false; }
if (!/Stopped and disposed/.test(stopped.content[0].text)) { console.error("FAIL: stop message"); ok = false; }
if (!ok) process.exit(1);
console.log("D7 PASS");
