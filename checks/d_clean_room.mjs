/**
 * d_clean_room — the real proof that CI will work: removes node_modules
 * entirely (no scripts/link-deps.sh symlinks, no reliance on a globally
 * installed pi), runs a genuine `npm install` against the public registry
 * using only package.json's declared devDependencies, then runs typecheck
 * and check:fast exactly as CI will.
 *
 * NOTE on runtime: if this repo lives on a 9p-mounted drive under WSL2 (e.g.
 * `/mnt/d/...`), a full install + typecheck can take 10-20+ minutes — the
 * network fetches are fast, but writing pi-coding-agent's ~239-package
 * dependency tree (it pulls in the AWS SDK, Anthropic SDK, etc.) is slow on
 * that filesystem. This is a sandbox-specific quirk, not a broken install; a
 * real GitHub Actions runner uses native ext4 and should not hit it. No
 * timeout is set here deliberately — let it run to completion rather than
 * fail a slow-but-working install.
 *
 * Pass conditions:
 *   - npm install succeeds with no scripts/link-deps.sh run beforehand
 *   - npm run typecheck succeeds
 *   - npm run check:fast succeeds
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
	console.log(`> ${cmd} ${args.join(" ")}`);
	return execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
}

rmSync(join(root, "node_modules"), { recursive: true, force: true });

let ok = true;
try {
	run("npm", ["install", "--no-audit", "--no-fund"]);
} catch (e) {
	console.error("FAIL: npm install failed:", e?.message ?? String(e));
	ok = false;
}

if (ok) {
	try {
		run("npm", ["run", "typecheck"]);
	} catch (e) {
		console.error("FAIL: npm run typecheck failed:", e?.message ?? String(e));
		ok = false;
	}
}

if (ok) {
	try {
		run("npm", ["run", "check:fast"]);
	} catch (e) {
		console.error("FAIL: npm run check:fast failed:", e?.message ?? String(e));
		ok = false;
	}
}

if (!ok) process.exit(1);
console.log("d_clean_room PASS");
