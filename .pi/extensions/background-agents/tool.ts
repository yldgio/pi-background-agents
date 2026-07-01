/**
 * background_agent tool dispatch — Task 4.
 *
 * A single tool with an `action` enum. `runAction` is a pure async dispatcher
 * over a BackgroundRegistry so it can be tested without a live pi runtime;
 * index.ts adapts it into a registered tool.
 */

import type { AgentConfig } from "./agents.ts";
import type { BackgroundRegistry } from "./registry.ts";

export type Action = "launch" | "send" | "status" | "collect" | "list" | "stop";

export interface ToolParams {
	action: Action;
	agent?: string;
	task?: string;
	runId?: string;
	message?: string;
	modelId?: string;
}

export interface ToolDeps {
	registry: BackgroundRegistry;
	resolveAgent: (name: string) => AgentConfig | undefined;
	listAgentNames: () => string[];
	parentModelSpec?: string;
}

export interface ToolResult {
	content: { type: "text"; text: string }[];
	isError?: boolean;
}

function text(t: string, isError = false): ToolResult {
	return { content: [{ type: "text", text: t }], isError };
}

function rosterLine(s: {
	runId: string;
	agent: string;
	status: string;
	turns: number;
	error?: string;
}): string {
	const base = `${s.runId} [${s.status}] agent=${s.agent} turns=${s.turns}`;
	return s.error ? `${base} error=${s.error}` : base;
}

export async function runAction(deps: ToolDeps, params: ToolParams): Promise<ToolResult> {
	const { registry } = deps;
	switch (params.action) {
		case "launch": {
			if (!params.agent || !params.task) {
				return text('launch requires "agent" and "task".', true);
			}
			const agent = deps.resolveAgent(params.agent);
			if (!agent) {
				const avail = deps.listAgentNames().join(", ") || "none";
				return text(`Unknown agent "${params.agent}". Available agents: ${avail}.`, true);
			}
			const modelId = params.modelId ?? agent.model ?? deps.parentModelSpec;
			try {
				const runId = registry.launch({ agent, task: params.task, modelId });
				return text(
					`Launched background agent "${agent.name}" as ${runId}. ` +
						`It runs concurrently; use action:"status" or action:"collect" with runId:"${runId}", ` +
						`action:"send" to give it a follow-up, or action:"stop" to cancel.`,
				);
			} catch (e: any) {
				return text(e?.message ?? String(e), true);
			}
		}
		case "send": {
			if (!params.runId || !params.message) {
				return text('send requires "runId" and "message".', true);
			}
			try {
				registry.send(params.runId, params.message);
				return text(`Sent follow-up to ${params.runId}. It will be processed on that agent's session.`);
			} catch (e: any) {
				return text(e?.message ?? String(e), true);
			}
		}
		case "status": {
			if (params.runId) {
				try {
					const s = registry.status(params.runId);
					return text(rosterLine(s));
				} catch (e: any) {
					return text(e?.message ?? String(e), true);
				}
			}
			const all = registry.list();
			if (all.length === 0) return text("No background agents.");
			return text(all.map(rosterLine).join("\n"));
		}
		case "list": {
			const all = registry.list();
			if (all.length === 0) return text("No background agents.");
			return text(all.map(rosterLine).join("\n"));
		}
		case "collect": {
			if (!params.runId) return text('collect requires "runId".', true);
			try {
				const c = registry.collect(params.runId);
				if (!c.done) {
					return text(
						`Agent ${c.runId} is still ${c.status}. No final result yet — ` +
							`call collect again later or use action:"status" to monitor.`,
					);
				}
				if (c.status === "error") {
					return text(`Agent ${c.runId} failed: ${c.error ?? "unknown error"}`, true);
				}
				return text(c.text || "(agent produced no text output)");
			} catch (e: any) {
				return text(e?.message ?? String(e), true);
			}
		}
		case "stop": {
			if (!params.runId) return text('stop requires "runId".', true);
			if (!registry.has(params.runId)) {
				return text(`Unknown agent run id "${params.runId}". It may have already been stopped.`, true);
			}
			await registry.stop(params.runId);
			return text(`Stopped and disposed ${params.runId}.`);
		}
		default:
			return text(`Unknown action "${(params as any).action}". Valid: launch, send, status, collect, list, stop.`, true);
	}
}
