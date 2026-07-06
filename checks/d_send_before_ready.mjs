/**
 * d_send_before_ready — proves a send() issued BEFORE the session is ready is
 * NOT silently dropped: both the initial task and the follow-up run in order.
 *
 * Pass conditions:
 *   - registry.status(runId).turns === 2  (both messages ran)
 *   - collect text contains echo of the follow-up message
 */
import { BackgroundRegistry } from "../registry.ts";
import { makeFakeSession } from "./_helpers.mjs";

// Factory with a deliberate 400 ms creation delay so send() arrives while
// the session is still being created.
const CREATION_DELAY = 400;
const RESOLVE_DELAY = 50;

const factory = async () => {
	await new Promise((r) => setTimeout(r, CREATION_DELAY));
	return makeFakeSession({ resolveAfterMs: RESOLVE_DELAY });
};

const reg = new BackgroundRegistry(factory);
const agent = { name: "early", description: "d", systemPrompt: "", source: "user", filePath: "" };

// launch() returns immediately; session not yet created.
const runId = reg.launch({ agent, task: "first-task" });

// Immediately (synchronously after launch) issue a send. Session is NOT ready yet.
reg.send(runId, "follow-up-message");

// Wait for all work to drain.
await reg.waitIdle(runId);

const sv = reg.status(runId);
const cv = reg.collect(runId);

console.log(JSON.stringify({ runId, turns: sv.turns, status: sv.status, text: cv.text.slice(0, 80) }, null, 2));

let ok = true;
if (sv.turns !== 2) {
	console.error(`FAIL: expected 2 turns (both messages ran), got ${sv.turns}`);
	ok = false;
}
if (!/follow-up-message/.test(cv.text)) {
	console.error(`FAIL: follow-up-message not reflected in final text (got "${cv.text}")`);
	ok = false;
}
if (sv.status !== "done") {
	console.error(`FAIL: expected status done, got ${sv.status}`);
	ok = false;
}

await reg.disposeAll();
if (!ok) process.exit(1);
console.log("d_send_before_ready PASS");
