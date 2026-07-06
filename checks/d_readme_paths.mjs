/**
 * d_readme_paths — proves README.md has a CI status badge and zero
 * leftover placeholder install paths after the rename to
 * pi-background-agents / github.com/yldgio/pi-background-agents.
 *
 * Pass conditions:
 *   - contains a badge markdown referencing the real workflow URL
 *   - zero occurrences of the old placeholder "you/background-agents-pi"
 *   - "yldgio/pi-background-agents" appears at least once
 */
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../README.md", import.meta.url), "utf8");

let ok = true;

if (!/!\[.*\]\(https:\/\/github\.com\/yldgio\/pi-background-agents\/actions\/workflows\/ci\.yml\/badge\.svg\)/.test(text)) {
	console.error("FAIL: no CI badge markdown found referencing yldgio/pi-background-agents");
	ok = false;
}

if (text.includes("you/background-agents-pi")) {
	console.error("FAIL: placeholder path \"you/background-agents-pi\" still present");
	ok = false;
}

if (!text.includes("yldgio/pi-background-agents")) {
	console.error("FAIL: real path \"yldgio/pi-background-agents\" not found anywhere");
	ok = false;
}

if (!ok) process.exit(1);
console.log("d_readme_paths PASS");
