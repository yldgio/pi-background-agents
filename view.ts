/**
 * User-facing view helpers for observability (widget roster + /agents detail).
 * Pure functions so they can be verified deterministically.
 */

import type { DisplayItem, RunStatus, StatusView } from "./registry.ts";

export const STATUS_ICON: Record<RunStatus, string> = {
	running: "⏳",
	done: "✓",
	error: "✗",
	stopped: "◼",
};

export function fmtAge(ms: number): string {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	return `${Math.floor(s / 60)}m${s % 60}s`;
}

function truncTask(task: string, n = 48): string {
	const t = task.replace(/\s+/g, " ").trim();
	return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** Compact always-on widget roster. Empty array when there are no agents. */
export function widgetLines(list: StatusView[]): string[] {
	if (list.length === 0) return [];
	const running = list.filter((a) => a.status === "running").length;
	const header = `Background agents: ${running} running / ${list.length} total`;
	const lines = list.map((a) => {
		const icon = STATUS_ICON[a.status] ?? "?";
		const extra = a.status === "running" ? ` ${a.turns}t ${fmtAge(a.ageMs)}` : "";
		const err = a.error ? ` — ${a.error.slice(0, 40)}` : "";
		return `${icon} ${a.runId} (${a.agent})${extra} · ${truncTask(a.task)}${err}`;
	});
	return [header, ...lines];
}

/** One-line-per-agent roster for `/agents` with no id. */
export function rosterLines(list: StatusView[]): string[] {
	return list.map(
		(a) =>
			`${STATUS_ICON[a.status] ?? "?"} ${a.runId} (${a.agent}) — ${a.status}, ${a.turns} turns · ${truncTask(a.task)}`,
	);
}

/** Detail dump for `/agents <id>`: status + task + recent activity items. */
export function agentDetailLines(s: StatusView, items: DisplayItem[]): string[] {
	const head = `${STATUS_ICON[s.status] ?? "?"} ${s.runId} (${s.agent}) — ${s.status}, ${s.turns} turns`;
	const taskLine = `  Task: ${truncTask(s.task, 120)}`;
	const body = items.map((it) =>
		it.type === "text"
			? `  ${it.text.split("\n")[0].slice(0, 100)}`
			: `  → ${it.name} ${JSON.stringify(it.args).slice(0, 60)}`,
	);
	const activity = items.length === 0 ? ["  Activity: (nothing yet)"] : ["  Activity:", ...body];
	return [head, taskLine, ...activity];
}
