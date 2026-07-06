/** D6 — collect via the tool returns the final assistant text once done. */
import { realRegistry, toolDeps } from "./_helpers.mjs";
import { runAction } from "../tool.ts";

const { registry } = await realRegistry();
const agent = {
	name: "echoer",
	description: "echo",
	systemPrompt: "Reply with exactly the token the user asks for and nothing else.",
	source: "user",
	filePath: "",
};
const deps = toolDeps(registry, agent);

const launched = await runAction(deps, { action: "launch", agent: "echoer", task: "Reply with exactly this token: DONE123" });
const runId = launched.content[0].text.match(/as (echoer-\d+)/)[1];
await registry.waitIdle(runId);
const c = await runAction(deps, { action: "collect", runId });

console.log(JSON.stringify({ runId, isError: !!c.isError, text: c.content[0].text.slice(0, 60) }, null, 2));

let ok = true;
if (c.isError) { console.error("FAIL: collect returned error"); ok = false; }
if (!/DONE123/.test(c.content[0].text)) { console.error(`FAIL: final text missing token (got "${c.content[0].text}")`); ok = false; }
await registry.disposeAll();
if (!ok) process.exit(1);
console.log("D6 PASS");
