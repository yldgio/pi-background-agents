/** D_default_tools — an agent whose frontmatter omits `tools` must resolve to
 * ALL built-in tools (not an empty array). This is the exact bug class from
 * the coder-1 incident: a subagent silently launched with zero tools. */
import { resolveTools, ALL_BUILTIN_TOOLS } from "../session-factory.ts";

const withoutTools = resolveTools(undefined);
const withExplicitTools = resolveTools(["read", "grep"]);

console.log(
	JSON.stringify(
		{ withoutTools, withExplicitTools, allBuiltins: ALL_BUILTIN_TOOLS },
		null,
		2,
	),
);

let ok = true;
if (withoutTools.length === 0) {
	console.error("FAIL: omitted tools resolved to an empty array (the exact regression this guards against)");
	ok = false;
}
if (JSON.stringify(withoutTools) !== JSON.stringify([...ALL_BUILTIN_TOOLS])) {
	console.error(`FAIL: omitted tools should resolve to all built-ins; got ${JSON.stringify(withoutTools)}`);
	ok = false;
}
if (JSON.stringify(withExplicitTools) !== JSON.stringify(["read", "grep"])) {
	console.error("FAIL: an explicit tools list must be respected as-is, not widened");
	ok = false;
}
if (!ok) process.exit(1);
console.log("D_default_tools PASS");
