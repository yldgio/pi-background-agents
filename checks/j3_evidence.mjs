/** J3 evidence — error & edge-case messages from the tool dispatcher. */
import { fakeRegistry, toolDeps } from "./_helpers.mjs";
import { runAction } from "../tool.ts";
import { MAX_CONCURRENT } from "../registry.ts";

const reg = fakeRegistry({ resolveAfterMs: null });
const agent = { name: "echoer", description: "d", systemPrompt: "", source: "user", filePath: "" };
const deps = toolDeps(reg, agent);

async function show(label, params) {
	const r = await runAction(deps, params);
	console.log(`--- ${label} ---`);
	console.log(`isError=${!!r.isError}`);
	console.log(r.content[0].text);
	console.log();
}

await show("unknown agent name", { action: "launch", agent: "ghost", task: "x" });
await show("launch missing task", { action: "launch", agent: "echoer" });
await show("send to unknown runId", { action: "send", runId: "echoer-99", message: "hi" });
await show("collect unknown runId", { action: "collect", runId: "echoer-99" });
await show("stop unknown runId", { action: "stop", runId: "echoer-99" });

const launched = await runAction(deps, { action: "launch", agent: "echoer", task: "run" });
const runId = launched.content[0].text.match(/as (echoer-\d+)/)[1];
await show("collect while still running", { action: "collect", runId });

// Fill to cap and overflow
for (let i = 1; i < MAX_CONCURRENT; i++) await runAction(deps, { action: "launch", agent: "echoer", task: `t${i}` });
await show("launch past concurrency cap", { action: "launch", agent: "echoer", task: "overflow" });
await show("unknown action", { action: "frobnicate" });

await reg.disposeAll();
console.log("J3 EVIDENCE OK");
