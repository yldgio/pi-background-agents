/**
 * D2 / Task 2 — agent discovery parses markdown+frontmatter and resolves
 * missing model to the injected parent model.
 *
 * Pass: exactly 2 valid agents from fixtures (invalid one skipped);
 *   scout keeps its explicit model; worker (no model) resolves to parent.
 */
import { loadAgentsFromDirExplicit, resolveAgentModel } from "../agents.ts";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "agents");
const PARENT = "github-copilot/gpt-5.4";

const agents = loadAgentsFromDirExplicit(fixtures, "user");
const byName = Object.fromEntries(agents.map((a) => [a.name, a]));

const evidence = {
	count: agents.length,
	names: agents.map((a) => a.name).sort(),
	scoutModel: byName.scout && resolveAgentModel(byName.scout, PARENT),
	workerModel: byName.worker && resolveAgentModel(byName.worker, PARENT),
	scoutTools: byName.scout?.tools,
};
console.log(JSON.stringify(evidence, null, 2));

const checks = [
	[agents.length === 2, "expected 2 valid agents (invalid.md skipped)"],
	[!!byName.scout && !!byName.worker, "scout and worker present"],
	[byName.scout?.model === "github-copilot/claude-haiku-4.5", "scout keeps explicit model"],
	[resolveAgentModel(byName.worker, PARENT) === PARENT, "worker inherits parent model"],
	[resolveAgentModel(byName.scout, PARENT) === "github-copilot/claude-haiku-4.5", "scout ignores parent (has own)"],
	[JSON.stringify(byName.scout?.tools) === JSON.stringify(["read", "grep", "find", "ls"]), "scout tools parsed"],
];

let ok = true;
for (const [pass, msg] of checks) {
	if (!pass) {
		console.error("FAIL:", msg);
		ok = false;
	}
}
if (!ok) process.exit(1);
console.log("D2 PASS");
