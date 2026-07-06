/** D5 — re-contact via the tool, proving the SAME session persists (context
 * preserved). launch -> collect -> send follow-up needing prior context -> collect. */
import { realRegistry, toolDeps } from "./_helpers.mjs";
import { runAction } from "../tool.ts";

const { registry } = await realRegistry();
const agent = {
	name: "mem",
	description: "memory",
	systemPrompt: "You are a terse memory agent. Keep answers to one short line.",
	source: "user",
	filePath: "",
};
const deps = toolDeps(registry, agent);

const launched = await runAction(deps, { action: "launch", agent: "mem", task: "Remember the secret number 42. Just reply: OK." });
const runId = launched.content[0].text.match(/as (mem-\d+)/)[1];
await registry.waitIdle(runId);
const first = await runAction(deps, { action: "collect", runId });

await runAction(deps, { action: "send", runId, message: "What was the secret number I told you? Reply with just the number." });
await registry.waitIdle(runId);
const second = await runAction(deps, { action: "collect", runId });

console.log(JSON.stringify({ runId, first: first.content[0].text.slice(0, 50), second: second.content[0].text.slice(0, 50) }, null, 2));

let ok = true;
if (!/42/.test(second.content[0].text)) { console.error(`FAIL: follow-up answer lost context (got "${second.content[0].text}")`); ok = false; }
await registry.disposeAll();
if (!ok) process.exit(1);
console.log("D5 PASS");
