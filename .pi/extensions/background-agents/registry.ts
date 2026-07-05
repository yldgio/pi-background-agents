/**
 * Background agent registry — Task 3.
 *
 * Tracks live, re-contactable agents in a Map<runId, record>. Each record owns
 * one persistent session and a serialized run queue: `send` enqueues a message
 * that is processed as a follow-up run on the SAME session (context preserved),
 * after the current run finishes. This is the deterministic "queued" semantics
 * (assumption A2's documented model) rather than mid-run steering.
 *
 * The registry is decoupled from the SDK via an injected `SessionFactory`, so
 * tests can supply real AgentSessions or controllable fakes.
 */

import { rmSync } from "node:fs";
import type { AgentConfig } from "./agents.ts";

export const MAX_CONCURRENT = 8;

export type RunStatus = "running" | "done" | "error" | "stopped";

/** Minimal session surface the registry needs (subset of AgentSession). */
export interface BgSession {
	prompt(text: string): Promise<void>;
	subscribe(listener: (event: any) => void): () => void;
	abort(): Promise<void>;
	dispose(): void;
	readonly state: { messages: any[] };
}

export interface SessionFactory {
	(input: { agent: AgentConfig; modelId?: string }): Promise<BgSession>;
}

export type DisplayItem =
	| { type: "text"; text: string }
	| { type: "toolCall"; name: string; args: Record<string, unknown> };

/** Max display items retained per agent (ring-buffer cap). */
const MAX_ITEMS = 200;

interface AgentRecord {
	runId: string;
	agentName: string;
	modelId?: string;
	status: RunStatus;
	task: string;
	// Messages queued before the session was ready (pre-session window).
	pendingQueue: string[];
	// Messages queued while a dispatch is in-flight (post-session serialisation).
	queue: string[];
	items: DisplayItem[];
	turns: number;
	error?: string;
	startedAt: number;
	updatedAt: number;
	session?: BgSession;
	unsubscribe?: () => void;
	// Temp directory created for this session's isolated agentDir; cleaned up on stop.
	tmpDir?: string;
	// resolves when the record reaches a terminal (done/error/stopped) state
	// AND its queue is drained. Used by tests to await completion.
	idle: Promise<void>;
	_resolveIdle?: () => void;
	_busy: boolean;
}

export interface StatusView {
	runId: string;
	agent: string;
	model?: string;
	status: RunStatus;
	task: string;
	turns: number;
	items: number;
	error?: string;
	ageMs: number;
}

export interface CollectView {
	runId: string;
	agent: string;
	status: RunStatus;
	done: boolean;
	text: string;
	error?: string;
}

function finalText(session: BgSession | undefined): string {
	if (!session) return "";
	const msgs = session.state.messages;
	for (let i = msgs.length - 1; i >= 0; i--) {
		const m = msgs[i];
		if (m.role === "assistant" && Array.isArray(m.content)) {
			for (const part of m.content) if (part.type === "text") return String(part.text).trim();
		}
	}
	return "";
}

export class BackgroundRegistry {
	private records = new Map<string, AgentRecord>();
	private counters = new Map<string, number>();
	private factory: SessionFactory;

	constructor(factory: SessionFactory) {
		this.factory = factory;
	}

	private activeCount(): number {
		let n = 0;
		for (const r of this.records.values()) if (r.status === "running") n++;
		return n;
	}

	private nextRunId(agentName: string): string {
		const n = (this.counters.get(agentName) ?? 0) + 1;
		this.counters.set(agentName, n);
		return `${agentName}-${n}`;
	}

	/**
	 * Launch a background agent. SYNCHRONOUS and non-blocking: returns a runId
	 * immediately; session creation and the first run happen asynchronously.
	 * Throws if the concurrency cap is reached.
	 */
	launch(input: { agent: AgentConfig; task: string; modelId?: string }): string {
		if (this.activeCount() >= MAX_CONCURRENT) {
			throw new Error(
				`Concurrency cap reached: ${this.activeCount()}/${MAX_CONCURRENT} agents running. ` +
					`Collect or stop an existing agent before launching another.`,
			);
		}
		const runId = this.nextRunId(input.agent.name);
		const now = Date.now();
		const rec: AgentRecord = {
			runId,
			agentName: input.agent.name,
			modelId: input.modelId,
			status: "running",
			task: input.task,
			pendingQueue: [input.task],
			queue: [],
			items: [],
			turns: 0,
			startedAt: now,
			updatedAt: now,
			idle: Promise.resolve(),
			_busy: false,
		};
		rec.idle = new Promise<void>((resolve) => {
			rec._resolveIdle = resolve;
		});
		this.records.set(runId, rec);

		// Kick off async session creation; flush pendingQueue once ready.
		void this.startSession(rec, input.agent).then(() => this.flushPending(rec));
		return runId;
	}

	private async startSession(rec: AgentRecord, agent: AgentConfig): Promise<void> {
		try {
			const session = await this.factory({ agent, modelId: rec.modelId });
			rec.session = session;
			rec.tmpDir = (session as any)._tmpDir as string | undefined;
			rec.unsubscribe = session.subscribe((event) => this.onEvent(rec, event));
		} catch (e: any) {
			rec.status = "error";
			rec.error = `Failed to start agent: ${e?.message ?? String(e)}`;
			rec.updatedAt = Date.now();
			rec.pendingQueue = [];
			rec._resolveIdle?.();
		}
	}

	/**
	 * Flush all messages buffered before the session was ready.
	 * Dispatches the first item immediately; the rest are prepended to the
	 * post-session queue so dispatch's own finally-loop drains them in order.
	 */
	private flushPending(rec: AgentRecord): void {
		if (rec.status === "stopped" || rec.status === "error") return;
		const pending = rec.pendingQueue.splice(0);
		if (pending.length === 0) return;
		const [first, ...rest] = pending;
		// Prepend rest before any items already in queue (there should be none
		// at this point, but be safe).
		rec.queue = [...rest, ...rec.queue];
		void this.dispatch(rec, first);
	}

	private onEvent(rec: AgentRecord, event: any): void {
		if (!event || typeof event.type !== "string") return;
		if (event.type === "tool_execution_start") {
			rec.items.push({ type: "toolCall", name: event.toolName, args: event.args ?? {} });
			rec.updatedAt = Date.now();
		} else if (event.type === "turn_end") {
			rec.turns++;
			const msg = event.message;
			if (msg && Array.isArray(msg.content)) {
				for (const part of msg.content) {
					if (part.type === "text" && part.text?.trim()) rec.items.push({ type: "text", text: part.text });
				}
			}
			rec.updatedAt = Date.now();
		}
		// Ring-buffer cap: keep only the most recent MAX_ITEMS items.
		if (rec.items.length > MAX_ITEMS) {
			rec.items = rec.items.slice(-MAX_ITEMS);
		}
	}

	/** Process one queued message as a run on the persistent session. */
	private async dispatch(rec: AgentRecord, text: string): Promise<void> {
		if (rec.status === "stopped" || rec.status === "error") return;
		if (rec._busy) {
			rec.queue.push(text);
			return;
		}
		rec._busy = true;
		rec.status = "running";
		rec.updatedAt = Date.now();
		try {
			await rec.session!.prompt(text);
			if ((rec.status as RunStatus) !== "stopped") {
				rec.status = "done";
			}
		} catch (e: any) {
			if ((rec.status as RunStatus) !== "stopped") {
				rec.status = "error";
				rec.error = e?.message ?? String(e);
			}
		} finally {
			rec._busy = false;
			rec.updatedAt = Date.now();
			const next = rec.queue.shift();
			if (next !== undefined && (rec.status as RunStatus) !== "stopped") {
				void this.dispatch(rec, next);
			} else if (rec.queue.length === 0) {
				rec._resolveIdle?.();
			}
		}
	}

	/**
	 * Send a follow-up to a background agent. If the session is not yet ready,
	 * the message is buffered in pendingQueue and processed in order once the
	 * session becomes available. If the session is ready, it is dispatched
	 * immediately (or queued behind an in-flight run). Same session either way
	 * → context preserved.
	 */
	send(runId: string, text: string): void {
		const rec = this.mustGet(runId);
		if (rec.status === "stopped") throw new Error(`Agent ${runId} was stopped; cannot send.`);
		if (rec.status === "error") throw new Error(`Agent ${runId} is in error state; cannot send.`);
		// reset idle gate since more work is coming
		if (rec.status === "done") {
			rec.idle = new Promise<void>((resolve) => {
				rec._resolveIdle = resolve;
			});
		}
		// If the session is not yet ready, buffer in pendingQueue.
		if (!rec.session) {
			rec.pendingQueue.push(text);
			return;
		}
		void this.dispatch(rec, text);
	}

	status(runId: string): StatusView {
		const rec = this.mustGet(runId);
		return this.toStatusView(rec);
	}

	list(): StatusView[] {
		return Array.from(this.records.values()).map((r) => this.toStatusView(r));
	}

	collect(runId: string): CollectView {
		const rec = this.mustGet(runId);
		const done = rec.status === "done" || rec.status === "error" || rec.status === "stopped";
		return {
			runId,
			agent: rec.agentName,
			status: rec.status,
			done,
			text: finalText(rec.session),
			error: rec.error,
		};
	}

	async stop(runId: string): Promise<void> {
		const rec = this.mustGet(runId);
		rec.status = "stopped";
		rec.queue = [];
		rec.pendingQueue = [];
		rec.updatedAt = Date.now();
		try {
			await rec.session?.abort();
		} catch {
			/* ignore */
		}
		try {
			rec.unsubscribe?.();
			rec.session?.dispose();
		} catch {
			/* ignore */
		}
		rec._resolveIdle?.();
		this.records.delete(runId);
		// Clean up the isolated temp directory created for this session.
		if (rec.tmpDir) {
			try {
				rmSync(rec.tmpDir, { recursive: true, force: true });
			} catch {
				/* ignore — OS may have already removed it */
			}
		}
	}

	/** Dispose all live sessions (shutdown). */
	async disposeAll(): Promise<void> {
		const ids = Array.from(this.records.keys());
		await Promise.all(ids.map((id) => this.stop(id).catch(() => {})));
		this.records.clear();
		this.counters.clear();
	}

	/** Recent display items for observability. */
	recentItems(runId: string, limit = 10): DisplayItem[] {
		const rec = this.mustGet(runId);
		return rec.items.slice(-limit);
	}

	size(): number {
		return this.records.size;
	}

	has(runId: string): boolean {
		return this.records.has(runId);
	}

	/** Await a record becoming idle (terminal + drained). Test helper. */
	waitIdle(runId: string): Promise<void> {
		return this.mustGet(runId).idle;
	}

	private toStatusView(rec: AgentRecord): StatusView {
		return {
			runId: rec.runId,
			agent: rec.agentName,
			model: rec.modelId,
			status: rec.status,
			task: rec.task,
			turns: rec.turns,
			items: rec.items.length,
			error: rec.error,
			ageMs: Date.now() - rec.startedAt,
		};
	}

	private mustGet(runId: string): AgentRecord {
		const rec = this.records.get(runId);
		if (!rec) {
			const known = Array.from(this.records.keys()).join(", ") || "none";
			throw new Error(`Unknown agent run id: "${runId}". Active: ${known}.`);
		}
		return rec;
	}
}
