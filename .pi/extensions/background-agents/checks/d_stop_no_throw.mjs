/**
 * d_stop_no_throw — proves tool.ts's stop action returns a clean isError result
 * (not an uncaught throw) when the run id is already gone (TOCTOU path).
 *
 * Pattern: launch, stop once (succeeds), stop same id again (id is gone).
 * The second stop must NOT throw — it must return { isError: true, text: ... }.
 *
 * Pass conditions:
 *   - second stop resolves (no throw)
 *   - result.isError === true
 *   - result message is non-empty
 */
import { fakeRegistry, toolDeps } from "./_helpers.mjs";
import { runAction } from "../tool.ts";

const reg = fakeRegistry({ resolveAfterMs: null });
const agent = { name: "ghost", description: "d", systemPrompt: "", source: "user", filePath: "" };
const deps = toolDeps(reg, agent);

// Launch and stop once cleanly.
const launched = await runAction(deps, { action: "launch", agent: "ghost", task: "go" });
const runId = launched.content[0].text.match(/as (ghost-\d+)/)[1];
const first = await runAction(deps, { action: "stop", runId });

// Now stop again — the record is already gone (TOCTOU simulation).
let secondResult;
let threw = false;
try {
	secondResult = await runAction(deps, { action: "stop", runId });
} catch (e) {
	threw = true;
	console.error("FAIL: stop() threw an uncaught error:", e?.message ?? String(e));
}

console.log(JSON.stringify({
	runId,
	firstStop: { isError: !!first.isError, msg: first.content[0].text },
	secondStop: threw
		? { threw: true }
		: { isError: !!secondResult?.isError, msg: secondResult?.content[0].text },
}, null, 2));

let ok = true;
if (threw) {
	ok = false; // already printed error above
}
if (!threw) {
	if (!secondResult?.isError) {
		console.error("FAIL: second stop should have isError=true");
		ok = false;
	}
	if (!secondResult?.content[0].text) {
		console.error("FAIL: second stop should have a non-empty error message");
		ok = false;
	}
}
if (first.isError) {
	console.error("FAIL: first stop should have succeeded (isError false)");
	ok = false;
}

if (!ok) process.exit(1);
console.log("d_stop_no_throw PASS");
