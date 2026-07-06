/**
 * d_contributing — proves CONTRIBUTING.md covers the four required topics
 * from spec Task 3: how to propose a change, required local checks, when
 * check:llm must be run (which files trigger it), and the adversarial
 * verification discipline (verifier != implementer).
 *
 * Pass conditions: all four topics present (substring/keyword checks —
 * intentionally loose since this gates presence, not prose quality; prose
 * quality is judged separately by the LLM-judge criterion J1).
 */
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../CONTRIBUTING.md", import.meta.url), "utf8");
const lower = text.toLowerCase();

let ok = true;
function require_(label, test) {
	if (!test) {
		console.error(`FAIL: CONTRIBUTING.md missing: ${label}`);
		ok = false;
	}
}

require_("how to propose a change (PR/branch/commit guidance)", /pull request|propose a change|branch/.test(lower));
require_("required local checks (typecheck/check:fast)", lower.includes("typecheck") && lower.includes("check:fast"));
require_("check:llm trigger files (registry.ts, session-factory.ts, agents.ts)",
	lower.includes("check:llm") && ["registry.ts", "session-factory.ts", "agents.ts"].every((f) => lower.includes(f)));
require_("adversarial verification discipline (verifier != implementer)",
	/adversarial/.test(lower) && /different model|not the same model|verifier.*implement/.test(lower));

if (!ok) process.exit(1);
console.log("d_contributing PASS");
