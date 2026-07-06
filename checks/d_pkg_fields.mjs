/**
 * d_pkg_fields — proves package.json is ready for standalone publishing:
 * renamed to pi-background-agents, repository/homepage point at the real
 * repo, and devDependencies pin the 6 SDK-adjacent packages at their exact
 * bundled versions (so `npm install` alone resolves everything, no
 * scripts/link-deps.sh needed).
 *
 * Pass conditions:
 *   - name === "pi-background-agents"
 *   - repository.url and homepage contain "yldgio/pi-background-agents"
 *   - devDependencies has exact pinned versions for all 6 packages
 */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const expectedDevDeps = {
	"@earendil-works/pi-coding-agent": "0.80.3",
	"@earendil-works/pi-ai": "0.80.3",
	"@earendil-works/pi-agent-core": "0.80.3",
	"@earendil-works/pi-tui": "0.80.3",
	"typebox": "1.1.38",
	"yaml": "2.9.0",
};

let ok = true;

if (pkg.name !== "pi-background-agents") {
	console.error(`FAIL: name is "${pkg.name}", expected "pi-background-agents"`);
	ok = false;
}

const repoUrl = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? "";
if (!repoUrl.includes("yldgio/pi-background-agents")) {
	console.error(`FAIL: repository does not reference yldgio/pi-background-agents (got: ${repoUrl})`);
	ok = false;
}
if (!(pkg.homepage ?? "").includes("yldgio/pi-background-agents")) {
	console.error(`FAIL: homepage does not reference yldgio/pi-background-agents (got: ${pkg.homepage})`);
	ok = false;
}
if (!(pkg.bugs?.url ?? pkg.bugs ?? "").includes("yldgio/pi-background-agents")) {
	console.error(`FAIL: bugs does not reference yldgio/pi-background-agents (got: ${JSON.stringify(pkg.bugs)})`);
	ok = false;
}

for (const [name, version] of Object.entries(expectedDevDeps)) {
	const got = pkg.devDependencies?.[name];
	if (got !== version) {
		console.error(`FAIL: devDependencies["${name}"] is "${got}", expected "${version}"`);
		ok = false;
	}
}

console.log(JSON.stringify({ name: pkg.name, repository: repoUrl, homepage: pkg.homepage, devDependencies: pkg.devDependencies }, null, 2));

if (!ok) process.exit(1);
console.log("d_pkg_fields PASS");
