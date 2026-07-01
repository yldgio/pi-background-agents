/** D8 — shutdown cleanup: disposeAll disposes every live session. */
import { fakeRegistry } from "./_helpers.mjs";

const reg = fakeRegistry({ resolveAfterMs: null });
const agent = { name: "svc", description: "d", systemPrompt: "", source: "user", filePath: "" };

for (let i = 0; i < 3; i++) reg.launch({ agent, task: `t${i}` });
const sizeBefore = reg.size();
await reg.disposeAll();
const sizeAfter = reg.size();

console.log(JSON.stringify({ sizeBefore, sizeAfter }, null, 2));

let ok = true;
if (sizeBefore !== 3) { console.error("FAIL: expected 3 live agents"); ok = false; }
if (sizeAfter !== 0) { console.error("FAIL: registry not empty after disposeAll"); ok = false; }
if (!ok) process.exit(1);
console.log("D8 PASS");
