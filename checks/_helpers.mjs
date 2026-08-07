/**
 * Shared test helpers for deterministic checks.
 *   - fakeFactory: controllable in-memory sessions (no LLM) for lifecycle/cap tests
 *   - realRegistry: a BackgroundRegistry backed by a fast real model for A2-style tests
 */
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { BackgroundRegistry } from "../registry.ts";
import { createRealSessionFactory } from "../session-factory.ts";

/**
 * A controllable fake session.
 * @param {{resolveAfterMs?: number|null, createDelayMs?: number}} opts
 *   resolveAfterMs=null  -> prompt() never resolves until abort() (stays running)
 *   resolveAfterMs=N     -> prompt() resolves after N ms, appending an assistant echo
 *   createDelayMs        -> delay before the factory returns (simulates slow creation)
 */
export function makeFakeSession(opts = {}) {
	const { resolveAfterMs = 200 } = opts;
	const listeners = new Set();
	const messages = [];
	let abortResolve;
	return {
		state: { messages },
		subscribe(fn) {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
		async prompt(text) {
			messages.push({ role: "user", content: [{ type: "text", text }] });
			// Emit a representative tool-call activity event (buffered by the registry).
			for (const fn of listeners) fn({ type: "tool_execution_start", toolName: "read", args: { path: "src/auth.ts" } });
			if (resolveAfterMs === null) {
				await new Promise((res) => {
					abortResolve = res;
				});
				return;
			}
			await new Promise((r) => setTimeout(r, resolveAfterMs));
			const reply = `echo:${text}`;
			for (const fn of listeners)
				fn({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: reply }] } });
			messages.push({ role: "assistant", content: [{ type: "text", text: reply }] });
		},
		async abort() {
			abortResolve?.();
		},
		dispose() {
			listeners.clear();
		},
	};
}

export function fakeFactory(opts = {}) {
	const { createDelayMs = 0 } = opts;
	return async () => {
		if (createDelayMs > 0) await new Promise((r) => setTimeout(r, createDelayMs));
		return makeFakeSession(opts);
	};
}

export function fakeRegistry(opts = {}) {
	return new BackgroundRegistry(fakeFactory(opts));
}

function pickFastModel(models) {
	for (const p of ["haiku", "flash", "mini"]) {
		const m = models.find((m) => m.id.toLowerCase().includes(p));
		if (m) return m;
	}
	return models[0];
}

/** Build a registry backed by a real fast model. Returns {registry, agent}. */
export async function realRegistry(systemPrompt = "You are a terse test agent.") {
	const modelRuntime = await ModelRuntime.create();
	const available = await modelRuntime.getAvailable();
	if (available.length === 0) throw new Error("No models available (auth?)");
	const model = pickFastModel(available);
	const factory = createRealSessionFactory({
		cwd: process.cwd(),
		modelRuntime,
		parentModel: model,
	});
	const registry = new BackgroundRegistry(factory);
	const agent = { name: "tester", description: "test", systemPrompt, source: "user", filePath: "" };
	return { registry, agent, model };
}

/** Build ToolDeps for runAction around a registry + a single fixed agent. */
export function toolDeps(registry, agent, parentModelSpec) {
	return {
		registry,
		resolveAgent: (name) => (name === agent.name ? agent : undefined),
		listAgentNames: () => [agent.name],
		parentModelSpec,
	};
}
