/**
 * Background Agents extension.
 *
 * Registers the `background_agent` tool (single tool, action enum), an always-on
 * widget roster, a read-only `/agents [id]` command, and shutdown cleanup.
 *
 * Architecture: each background agent is a live in-process AgentSession tracked
 * in a BackgroundRegistry. Agents are defined as markdown+frontmatter (see
 * agents.ts) and inherit the main agent's model when frontmatter omits `model`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { discoverAgents } from "./agents.ts";
import { BackgroundRegistry } from "./registry.ts";
import { createRealSessionFactory } from "./session-factory.ts";
import { runAction } from "./tool.ts";
import { agentDetailLines, rosterLines, widgetLines } from "./view.ts";

const WIDGET_ID = "background-agents";

export default function (pi: ExtensionAPI) {
	let registry: BackgroundRegistry | undefined;
	let widgetTimer: ReturnType<typeof setInterval> | undefined;

	// biome-ignore lint/suspicious/noExplicitAny: extension ctx
	function getRegistry(ctx: any): BackgroundRegistry {
		if (!registry) {
			const factory = createRealSessionFactory({
				cwd: ctx.cwd,
				modelRegistry: ctx.modelRegistry,
				parentModel: ctx.model,
			});
			registry = new BackgroundRegistry(factory);
		}
		return registry;
	}

	// biome-ignore lint/suspicious/noExplicitAny: extension ctx
	function parentModelSpec(ctx: any): string | undefined {
		return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
	}

	function renderWidget(ctx: any): void {
		if (!ctx.hasUI) return;
		ctx.ui.setWidget(WIDGET_ID, widgetLines(registry?.list() ?? []));
	}

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI && !widgetTimer) {
			widgetTimer = setInterval(() => renderWidget(ctx), 1000);
			// Node timers keep the process alive; don't let the widget do that.
			(widgetTimer as any).unref?.();
		}
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		if (widgetTimer) {
			clearInterval(widgetTimer);
			widgetTimer = undefined;
		}
		if (registry) {
			await registry.disposeAll();
		}
	});

	pi.registerTool({
		name: "background_agent",
		label: "Background Agent",
		description: [
			"Delegate a task to a named background subagent that runs concurrently and can be re-contacted.",
			'Actions: launch (agent+task -> runId), send (runId+message follow-up, context preserved),',
			"status (runId or all), collect (runId -> final result or still-running), list, stop (runId).",
			"launch returns immediately; the agent keeps running while you work. Use collect to get the result.",
		].join(" "),
		promptSnippet:
			"Delegate long/independent work to a background subagent (launch), then send/collect its result later",
		promptGuidelines: [
			"Use background_agent (action:launch) to delegate independent or long-running work so you can keep going; poll with action:collect.",
			'Use background_agent action:send to give a running/finished agent a follow-up — its session context is preserved.',
			"Use background_agent action:collect before relying on a background agent's output; if it is still running, collect again later.",
		],
		parameters: Type.Object({
			action: StringEnum(["launch", "send", "status", "collect", "list", "stop"] as const, {
				description: "The lifecycle action to perform.",
			}),
			agent: Type.Optional(Type.String({ description: "Agent name to launch (action:launch)." })),
			task: Type.Optional(Type.String({ description: "Task for the agent (action:launch)." })),
			runId: Type.Optional(Type.String({ description: "Target agent run id (send/status/collect/stop)." })),
			message: Type.Optional(Type.String({ description: "Follow-up message (action:send)." })),
			modelId: Type.Optional(
				Type.String({ description: "Override model provider/id; defaults to agent frontmatter or the current model." }),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const reg = getRegistry(ctx);
			const discovery = discoverAgents(ctx.cwd, "both");

			// Project-agent trust gate: if the action is launch and the resolved
			// agent comes from a repo-controlled file (.pi/agents/), ask for
			// confirmation before running it (only when a UI is available).
			if (params.action === "launch" && params.agent) {
				const candidate = discovery.agents.find((a) => a.name === params.agent);
				if (candidate?.source === "project" && ctx.hasUI) {
					const confirmed = await ctx.ui.confirm(
						`Run project agent "${candidate.name}"?`,
						`The agent "${candidate.name}" is defined in a repo-controlled file ` +
							`(${candidate.filePath}). ` +
							`Only run project agents from repositories you trust.`,
					);
					if (!confirmed) {
						return {
							content: [
								{
									type: "text" as const,
									text: `Launch canceled: user declined to run project-scoped agent "${candidate.name}".`,
								},
							],
							details: {},
							isError: false,
						};
					}
				}
			}

			const result = await runAction(
				{
					registry: reg,
					resolveAgent: (name) => discovery.agents.find((a) => a.name === name),
					listAgentNames: () => discovery.agents.map((a) => a.name),
					parentModelSpec: parentModelSpec(ctx),
				},
				params,
			);
			renderWidget(ctx);
			return { content: result.content, details: {}, isError: result.isError };
		},
	});

	pi.registerCommand("agents", {
		description: "List background agents, or show recent activity for one: /agents [runId]",
		handler: async (args, ctx) => {
			if (!registry || registry.size() === 0) {
				ctx.ui.notify("No background agents.", "info");
				return;
			}
			const runId = args.trim();
			if (runId) {
				if (!registry.has(runId)) {
					ctx.ui.notify(`Unknown agent run id "${runId}".`, "warning");
					return;
				}
				const s = registry.status(runId);
				const items = registry.recentItems(runId, 10);
				ctx.ui.notify(agentDetailLines(s, items).join("\n"), "info");
				return;
			}
			ctx.ui.notify(rosterLines(registry.list()).join("\n"), "info");
		},
	});
}
