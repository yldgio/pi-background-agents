/**
 * D1 / Task 1 spike — validate assumption A1:
 * Multiple concurrent in-process AgentSessions can be created and prompted
 * using the SDK (the exact code path the background_agent tool will use).
 *
 * Pass condition: both sessions return non-empty output AND concurrent
 * wall-time < sum of individual runtimes (proves real concurrency).
 */
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function pickFastModel(models) {
	const pref = ["haiku", "flash", "mini", "gpt-5-mini"];
	for (const p of pref) {
		const m = models.find((m) => m.id.toLowerCase().includes(p));
		if (m) return m;
	}
	return models[0];
}

async function makeSession(model, modelRuntime, systemPrompt) {
	// Isolate resource discovery to an empty temp agentDir so the subagent does
	// NOT load skills/extensions from the real environment.
	const emptyAgentDir = mkdtempSync(join(tmpdir(), "pi-subagent-home-"));
	const loader = new DefaultResourceLoader({
		cwd: process.cwd(),
		agentDir: emptyAgentDir,
		systemPromptOverride: () => systemPrompt,
		appendSystemPromptOverride: () => [],
	});
	await loader.reload();
	const { session } = await createAgentSession({
		cwd: process.cwd(),
		agentDir: emptyAgentDir,
		model,
		thinkingLevel: "off",
		modelRuntime,
		tools: [],
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(),
	});
	return session;
}

function finalText(session) {
	const msgs = session.state.messages;
	for (let i = msgs.length - 1; i >= 0; i--) {
		const m = msgs[i];
		if (m.role === "assistant") {
			for (const part of m.content) if (part.type === "text") return part.text.trim();
		}
	}
	return "";
}

async function runTimed(session, prompt) {
	const start = Date.now();
	await session.prompt(prompt);
	return { ms: Date.now() - start, text: finalText(session) };
}

async function main() {
	const modelRuntime = await ModelRuntime.create();
	const available = await modelRuntime.getAvailable();
	if (available.length === 0) throw new Error("No models available (auth?)");
	const model = pickFastModel(available);

	const sysA = "You are agent ALPHA. Reply with exactly one word: ALPHA.";
	const sysB = "You are agent BETA. Reply with exactly one word: BETA.";
	const [sa, sb] = await Promise.all([
		makeSession(model, modelRuntime, sysA),
		makeSession(model, modelRuntime, sysB),
	]);

	try {
		const wallStart = Date.now();
		// Fire both concurrently WITHOUT awaiting sequentially.
		const [ra, rb] = await Promise.all([
			runTimed(sa, "Go."),
			runTimed(sb, "Go."),
		]);
		const wallMs = Date.now() - wallStart;
		const sumMs = ra.ms + rb.ms;

		const bothNonEmpty = ra.text.length > 0 && rb.text.length > 0;
		const concurrent = wallMs < sumMs * 0.85;

		const evidence = {
			model: `${model.provider}/${model.id}`,
			alpha: { ms: ra.ms, text: ra.text.slice(0, 80) },
			beta: { ms: rb.ms, text: rb.text.slice(0, 80) },
			wallMs,
			sumMs,
			concurrencyRatio: +(wallMs / sumMs).toFixed(3),
			bothNonEmpty,
			concurrent,
		};
		console.log(JSON.stringify(evidence, null, 2));

		if (!bothNonEmpty) {
			console.error("FAIL: a session returned empty output");
			process.exit(1);
		}
		if (!concurrent) {
			console.error(`FAIL: not concurrent (wall ${wallMs}ms vs sum ${sumMs}ms)`);
			process.exit(1);
		}
		console.log("D1 PASS");
	} finally {
		sa.dispose();
		sb.dispose();
	}
}

main().catch((e) => {
	console.error("D1 ERROR:", e?.stack || e?.message || String(e));
	process.exit(1);
});
