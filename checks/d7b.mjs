/** D7b — cap enforced via the tool: 9th launch returns isError with a clear
 * message naming the cap and running count (not a thrown exception). */
import { fakeRegistry, toolDeps } from "./_helpers.mjs";
import { runAction } from "../tool.ts";
import { MAX_CONCURRENT } from "../registry.ts";

const reg = fakeRegistry({ resolveAfterMs: null });
const agent = { name: "load", description: "d", systemPrompt: "", source: "user", filePath: "" };
const deps = toolDeps(reg, agent);

let launched = 0;
for (let i = 0; i < MAX_CONCURRENT; i++) {
	const r = await runAction(deps, { action: "launch", agent: "load", task: `t${i}` });
	if (!r.isError) launched++;
}
const overflow = await runAction(deps, { action: "launch", agent: "load", task: "overflow" });
const msg = overflow.content[0].text;

console.log(JSON.stringify({ cap: MAX_CONCURRENT, launched, isError: overflow.isError, msg }, null, 2));

let ok = true;
if (launched !== MAX_CONCURRENT) { console.error("FAIL: could not launch to cap"); ok = false; }
if (!overflow.isError) { console.error("FAIL: overflow not flagged isError"); ok = false; }
if (!/cap/i.test(msg) || !msg.includes(`${MAX_CONCURRENT}`)) { console.error("FAIL: message missing cap/count"); ok = false; }
await reg.disposeAll();
if (!ok) process.exit(1);
console.log("D7b PASS");
