/**
 * d_tmpdir_cleanup — proves temp directories created per session are removed
 * after stop() (and disposeAll()).
 *
 * Uses a custom factory that wraps makeFakeSession but also creates a real
 * temp directory and attaches it as _tmpDir — mirroring what session-factory.ts
 * does in production. No LLM needed.
 *
 * Pass conditions:
 *   - tmpDir for the stopped agent no longer exists on disk
 *   - tmpDir for the disposeAll agent no longer exists on disk
 *   - registry is empty after each operation
 */
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BackgroundRegistry } from "../registry.ts";
import { makeFakeSession } from "./_helpers.mjs";

function makeTmpDirFactory() {
	const dirs = [];
	const factory = async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "pi-bgagent-home-test-"));
		dirs.push(tmpDir);
		const session = makeFakeSession({ resolveAfterMs: 50 });
		session._tmpDir = tmpDir;
		return session;
	};
	return { factory, dirs };
}

// --- Test 1: stop() cleans up the temp dir ---
const t1 = makeTmpDirFactory();
const reg1 = new BackgroundRegistry(t1.factory);
const agent = { name: "tester", description: "d", systemPrompt: "", source: "user", filePath: "" };

const runId1 = reg1.launch({ agent, task: "go" });
await reg1.waitIdle(runId1);
// Capture dir before stop
const dir1 = t1.dirs[0];
if (!dir1) { console.error("FAIL: factory never created a tmpDir"); process.exit(1); }
const existsBefore1 = existsSync(dir1);
await reg1.stop(runId1);
const existsAfter1 = existsSync(dir1);

console.log(JSON.stringify({ test: "stop()", dir: dir1, existsBefore: existsBefore1, existsAfter: existsAfter1 }, null, 2));

let ok = true;
if (!existsBefore1) { console.error("FAIL: tmpDir did not exist before stop"); ok = false; }
if (existsAfter1) { console.error("FAIL: tmpDir still exists after stop()"); ok = false; }
if (reg1.size() !== 0) { console.error("FAIL: registry not empty after stop"); ok = false; }

// --- Test 2: disposeAll() cleans up temp dirs ---
const t2 = makeTmpDirFactory();
const reg2 = new BackgroundRegistry(t2.factory);

const runIdA = reg2.launch({ agent, task: "a" });
const runIdB = reg2.launch({ agent, task: "b" });
await reg2.waitIdle(runIdA);
await reg2.waitIdle(runIdB);

const dirA = t2.dirs[0];
const dirB = t2.dirs[1];
if (!dirA || !dirB) { console.error("FAIL: factory did not create 2 tmpDirs"); process.exit(1); }
const existsBeforeA = existsSync(dirA);
const existsBeforeB = existsSync(dirB);
await reg2.disposeAll();
const existsAfterA = existsSync(dirA);
const existsAfterB = existsSync(dirB);

console.log(JSON.stringify({
	test: "disposeAll()",
	dirA, existsBeforeA, existsAfterA,
	dirB, existsBeforeB, existsAfterB,
}, null, 2));

if (!existsBeforeA) { console.error("FAIL: tmpDirA did not exist before disposeAll"); ok = false; }
if (!existsBeforeB) { console.error("FAIL: tmpDirB did not exist before disposeAll"); ok = false; }
if (existsAfterA) { console.error("FAIL: tmpDirA still exists after disposeAll()"); ok = false; }
if (existsAfterB) { console.error("FAIL: tmpDirB still exists after disposeAll()"); ok = false; }
if (reg2.size() !== 0) { console.error("FAIL: registry not empty after disposeAll"); ok = false; }

if (!ok) process.exit(1);
console.log("d_tmpdir_cleanup PASS");
