/**
 * d_ci_yaml — proves .github/workflows/ci.yml is valid YAML with the
 * structure the spec requires: triggers on push to main and on all pull
 * requests, and runs checkout -> setup-node(24) -> npm install -> npm run
 * typecheck -> npm run check:fast, in that order.
 *
 * Pass conditions:
 *   - file parses as valid YAML
 *   - on.push.branches includes "main"
 *   - on.pull_request key exists
 *   - some job's steps include, in order: an actions/checkout* step, an
 *     actions/setup-node* step with node-version 24, and run commands
 *     containing "npm install", "npm run typecheck", "npm run check:fast"
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const path = new URL("../.github/workflows/ci.yml", import.meta.url);
const raw = readFileSync(path, "utf8");

let doc;
try {
	doc = parse(raw);
} catch (e) {
	console.error("FAIL: not valid YAML:", e?.message ?? String(e));
	process.exit(1);
}

let ok = true;

// YAML parses bare `on:` as boolean key `true` in some parsers; support both.
const on = doc.on ?? doc[true] ?? doc["on"];
const push = on?.push;
const branches = push?.branches ?? [];
if (!Array.isArray(branches) || !branches.includes("main")) {
	console.error(`FAIL: on.push.branches does not include "main" (got: ${JSON.stringify(branches)})`);
	ok = false;
}
if (!("pull_request" in (on ?? {}))) {
	console.error("FAIL: on.pull_request is missing");
	ok = false;
}

const jobs = doc.jobs ?? {};
const jobNames = Object.keys(jobs);
if (jobNames.length === 0) {
	console.error("FAIL: no jobs defined");
	ok = false;
}

let foundValidJob = false;
for (const name of jobNames) {
	const steps = jobs[name].steps ?? [];
	const uses = steps.map((s) => s.uses ?? "");
	const runs = steps.map((s) => s.run ?? "");

	const checkoutIdx = uses.findIndex((u) => u.startsWith("actions/checkout"));
	const setupNodeIdx = uses.findIndex((u) => u.startsWith("actions/setup-node"));
	const installIdx = runs.findIndex((r) => r.includes("npm install") || r.includes("npm ci"));
	const typecheckIdx = runs.findIndex((r) => r.includes("npm run typecheck"));
	const fastIdx = runs.findIndex((r) => r.includes("npm run check:fast"));

	if ([checkoutIdx, setupNodeIdx, installIdx, typecheckIdx, fastIdx].some((i) => i === -1)) continue;
	if (!(checkoutIdx < setupNodeIdx && setupNodeIdx < installIdx && installIdx < typecheckIdx && typecheckIdx < fastIdx)) continue;

	const setupNodeStep = steps[setupNodeIdx];
	const nodeVersion = String(setupNodeStep.with?.["node-version"] ?? "");
	if (!nodeVersion.startsWith("24")) continue;

	foundValidJob = true;
	break;
}

if (!foundValidJob) {
	console.error("FAIL: no job has the required step sequence (checkout -> setup-node@24 -> npm install -> typecheck -> check:fast)");
	ok = false;
}

console.log(JSON.stringify({ jobNames, on }, null, 2));

if (!ok) process.exit(1);
console.log("d_ci_yaml PASS");
