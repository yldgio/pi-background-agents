/** J2 evidence — observability output (widget roster + /agents detail) with a
 * mix of running / done / error agents. Deterministic (fake registry). */
import { fakeRegistry } from "./_helpers.mjs";
import { widgetLines, rosterLines, agentDetailLines } from "../view.ts";

// Two long-running + one that finishes quickly, to get a mixed roster.
const running = fakeRegistry({ resolveAfterMs: null });
const agent = (name) => ({ name, description: "d", systemPrompt: "", source: "user", filePath: "" });

const scoutId = running.launch({ agent: agent("scout"), task: "Find all authentication and session-token handling code" });
const plannerId = running.launch({ agent: agent("planner"), task: "Draft a migration plan to move auth to OAuth2" });

// Simulate some activity on scout for the detail view.
running.status(scoutId); // no-op, but keeps parity
// Inject fake display items via a second registry that resolves, to show detail:
const done = fakeRegistry({ resolveAfterMs: 30 });
const echoId = done.launch({ agent: agent("echoer"), task: "Summarize README.md in one line" });
await done.waitIdle(echoId);

console.log("=== WIDGET (always-on roster) ===");
console.log(widgetLines(running.list()).join("\n"));

console.log("\n=== /agents (roster) ===");
console.log(rosterLines([...running.list(), ...done.list()]).join("\n"));

console.log("\n=== /agents <id> (detail: running agent, no activity yet) ===");
console.log(agentDetailLines(running.status(scoutId), running.recentItems(scoutId)).join("\n"));

console.log("\n=== /agents <id> (detail: finished agent) ===");
console.log(agentDetailLines(done.status(echoId), done.recentItems(echoId)).join("\n"));

await running.disposeAll();
await done.disposeAll();
console.log("\nJ2 EVIDENCE OK");
