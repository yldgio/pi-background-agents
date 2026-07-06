/**
 * d_changelog — proves CHANGELOG.md exists and documents both released
 * versions (0.1.0, 0.2.0) with non-trivial (non-empty) content under each.
 *
 * Pass conditions:
 *   - a "0.1.0" heading and a "0.2.0" heading both exist
 *   - each section has at least one bullet/line of real content
 */
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");

let ok = true;
const versionHeadingRe = (v) => new RegExp(`^#+.*${v.replace(/\./g, "\\.")}`, "m");

function sectionContent(version) {
	const idx = text.search(versionHeadingRe(version));
	if (idx === -1) return null;
	const rest = text.slice(idx);
	const nextHeadingIdx = rest.slice(1).search(/^##\s/m);
	return nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx + 1);
}

for (const v of ["0.1.0", "0.2.0"]) {
	const content = sectionContent(v);
	if (content === null) {
		console.error(`FAIL: no heading found for version ${v}`);
		ok = false;
		continue;
	}
	const bodyLines = content.split("\n").slice(1).filter((l) => l.trim().length > 0);
	if (bodyLines.length === 0) {
		console.error(`FAIL: version ${v} heading has no content under it`);
		ok = false;
	}
}

if (!ok) process.exit(1);
console.log("d_changelog PASS");
