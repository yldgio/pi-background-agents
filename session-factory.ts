/**
 * Real session factory — wires the registry to the SDK's createAgentSession.
 *
 * Each background agent gets an isolated, in-memory session with the agent's
 * markdown body as its system prompt. Resource discovery is pointed at an empty
 * temp agentDir so subagents do NOT recursively load this extension, skills, or
 * user prompts.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { AgentConfig } from "./agents.ts";
import type { BgSession, SessionFactory } from "./registry.ts";

/**
 * All built-in tool names pi's SDK supports (per docs/sdk.md's "Tools" section).
 * Note this is broader than the SDK's own createAgentSession() default (which
 * only enables read/bash/edit/write) — when an agent's frontmatter omits
 * `tools`, we deliberately enable every built-in rather than that narrower
 * default or (the previous bug) an empty allowlist.
 */
export const ALL_BUILTIN_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;

/** Resolve the tools an agent should run with: its explicit allowlist, or all built-ins. */
export function resolveTools(agentTools: string[] | undefined): string[] {
	return agentTools ?? [...ALL_BUILTIN_TOOLS];
}

export interface RealFactoryDeps {
	cwd: string;
	modelRuntime: ModelRuntime;
	// biome-ignore lint/suspicious/noExplicitAny: SDK Model (ctx.model) for inheritance
	parentModel?: any;
}

// biome-ignore lint/suspicious/noExplicitAny: returns SDK Model
function resolveModel(deps: RealFactoryDeps, agent: AgentConfig, modelId?: string): any {
	const spec = modelId ?? agent.model;
	if (!spec) {
		if (deps.parentModel) return deps.parentModel;
		throw new Error("No model specified for agent and no parent model to inherit.");
	}
	if (deps.parentModel && `${deps.parentModel.provider}/${deps.parentModel.id}` === spec) {
		return deps.parentModel;
	}
	const slash = spec.indexOf("/");
	const provider = slash >= 0 ? spec.slice(0, slash) : spec;
	const id = slash >= 0 ? spec.slice(slash + 1) : spec;
	const found = deps.modelRuntime.getModel(provider, id);
	if (found) return found;
	if (deps.parentModel) return deps.parentModel;
	throw new Error(`Model not found: "${spec}" (and no parent model to inherit).`);
}

export function createRealSessionFactory(deps: RealFactoryDeps): SessionFactory {
	return async ({ agent, modelId }) => {
		const model = resolveModel(deps, agent, modelId);
		const emptyAgentDir = mkdtempSync(join(tmpdir(), "pi-bgagent-home-"));
		const loader = new DefaultResourceLoader({
			cwd: deps.cwd,
			agentDir: emptyAgentDir,
			systemPromptOverride: () => agent.systemPrompt?.trim() || "You are a helpful subagent.",
			appendSystemPromptOverride: () => [],
		});
		await loader.reload();
		const { session } = await createAgentSession({
			cwd: deps.cwd,
			agentDir: emptyAgentDir,
			model,
			thinkingLevel: "off",
			modelRuntime: deps.modelRuntime,
			tools: resolveTools(agent.tools),
			resourceLoader: loader,
			sessionManager: SessionManager.inMemory(deps.cwd),
		});
		// Attach the temp dir path so the registry can clean it up on stop().
		(session as any)._tmpDir = emptyAgentDir;
		return session as unknown as BgSession;
	};
}
