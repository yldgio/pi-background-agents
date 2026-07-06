# Spec: Background Subagents

> Goal: Delegate tasks to background, re-contactable subagents running as live in-process AgentSessions.
> Date: 2026-07-01
> Status: Complete
> Completed: 2026-07-01

---

## What & Why

Build background, re-contactable subagents as the **foundation** of a fuller delegation
system. The existing `subagent` example extension
(`examples/extensions/subagent/`) already delegates tasks to specialized agents defined
as markdown+frontmatter, exposes them as a tool, supports own-model/own-tools, and runs
single/parallel/chain modes — but each subagent is a **one-shot `pi` subprocess** that
runs to completion and exits. It cannot be contacted again.

This spec delivers the one capability that architecture fundamentally can't: a subagent
that runs **in the background**, keeps running while the main agent works, and can be
**contacted again** (follow-ups), **queried**, and **collected** later. This is the
piece that forces a new architecture (a live in-process `AgentSession` registry) and
therefore justifies a new extension.

The broader vision — dynamic agent creation from a DB/files, full model/context
inheritance, dynamic model injection — is explicitly sequenced into later phases. We
build #1 first, architected so the rest can layer on.

## Done Looks Like

- The **model** launches a named agent on a task via a tool; the call **returns a handle
  (run id) immediately** rather than blocking.
- The agent **runs concurrently** while the main agent keeps working.
- The model can **send a follow-up** to a running agent, **query its status/output**, and
  **collect the final result** when done.
- **Multiple background agents** run at once (capped).
- The **user can observe (read-only)** which agents are running and what they are doing,
  via an always-on widget roster plus a `/agents [id]` command.

---

## Scope

### In Scope

- Live in-process `AgentSession` per background agent, tracked in a registry.
- A single `background_agent` tool with an `action` enum: `launch`, `send`, `status`,
  `collect`, `list`, `stop`.
- Agent discovery reusing the example's markdown+frontmatter format and locations.
- Parent-model inheritance when an agent's frontmatter omits `model`.
- Read-only user observability: always-on widget roster + `/agents [id]` command.
- Cleanup of all live background sessions on `session_shutdown`.
- Concurrency cap (default 8 concurrent background agents).

### Out of Scope

- **Dynamic agent creation from a DB or files at runtime** — *phase 2; keep the reused
  markdown format so it can extend cleanly.*
- **Full context inheritance and dynamic model injection by the main process** — *phase 3;
  only the "inherit parent model when unspecified" slice is included here because it is
  nearly free with the SDK.*
- **User-facing commands to launch or interact with agents** — *user is read-only in v1;
  the model drives all interaction.*
- **Persistence across `/new`, `/resume`, or pi restarts** — *process-lifetime, in-memory
  only; avoids session-replacement lifecycle and on-disk running-state complexity.*
- **Separate-tools-per-verb interface** — *recorded as a future experiment (see below),
  not built now.*
- **Writing session files for subagents** — *background sessions use
  `SessionManager.inMemory()`.*

---

## Constraints & Assumptions

### Hard Constraints

- pi extension API + embedded SDK (`createAgentSession` / `AgentSession`); TypeScript via
  jiti. Imports from `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`,
  `typebox`, `@earendil-works/pi-tui`.
- Single Node process; **process-lifetime, in-memory** state only — no disk persistence of
  running agents.
- Background sessions use `SessionManager.inMemory()` (no session files written).
- **Model-only control**; the user is read-only.
- Reuse the example's agent markdown format and `discoverAgents()` logic.
- Single `background_agent` tool with an `action` enum.
- Concurrency cap: **8** concurrent background agents (matches the example's
  `MAX_PARALLEL_TASKS`).

### Assumptions

- **A1** — An extension can create and run multiple concurrent `AgentSession`s from inside
  a tool `execute()` using `ctx.modelRegistry`/`ctx.model`. — *If wrong: fall back to a
  long-lived subprocess + RPC control channel. Verified by Task 1.*
- **A2** — `steer()`/`followUp()` can deliver a follow-up to a background session mid-run,
  enabling "contact the running agent." — *Resolved: implemented as the documented
  **queued** fallback instead — `send` enqueues a follow-up processed as a new run on the
  same persistent session (context preserved). Chosen for determinism; proven by D5. Task 4.*
- **A3** — A background session's streamed events can be buffered for later
  `status`/`collect`/observability without blocking the main agent. — *If wrong: cap or
  sample the buffer. Verified by Task 3.*

---

## Decisions Already Made

| Decision | Rationale |
|----------|-----------|
| In-process live `AgentSession` registry | Only path that supports re-contacting a running agent |
| Reuse example markdown agent format + `discoverAgents()` | Already works; matches original requirement; extends cleanly for phase 2 |
| Inherit parent model when frontmatter omits `model` | Nearly-free slice of deferred model-injection; SDK takes a model anyway |
| Single `background_agent` tool + action enum | Smallest surface; one place for the lifecycle state machine |
| In-memory, process-lifetime only | Avoids session-replacement lifecycle and persistence complexity |
| Always-on widget + minimal `/agents [id]` | Satisfies "at least see what it's doing" without a full overlay |
| Concurrency cap of 8 | Bounds resource use in a shared process |

### Behavioral Details

Resolutions for decisions left implicit during the interview, now made explicit:

- **Run-id format**: `<agent-name>-<n>`, where `n` is a per-name counter incremented at
  launch (e.g. `scout-1`, `scout-2`, `planner-1`). Human-readable, stable within a process,
  and easy for the model to reference in `send`/`status`/`collect`/`stop`.
- **`collect` while still running**: **non-blocking**. `collect` returns the current state
  with an explicit `done: boolean` flag and the latest final-assistant text so far. If the
  agent is still `running`, it returns `done: false` plus a hint to use `status` or
  `collect` again later — it never blocks the main agent.
- **Buffered events for observability**: buffer **assistant text and tool calls only**
  (the same `DisplayItem` shape the example uses), not raw token deltas or full tool
  results. Keeps memory bounded and matches what the widget / `/agents` view needs.
- **Concurrency-cap overflow**: when a `launch` would exceed the 8-agent cap, **reject**
  with a clear message stating the cap, the count of running agents, and that the caller
  should `collect`/`stop` an existing agent first. (No queue in v1; feeds J3.)

**Future experiment (not built now):** separate-tools-per-verb interface
(`launch_agent`, `contact_agent`, ...). Evaluation criterion J1 provides the data to decide
whether the split improves model behavior enough to justify it.

---

## Task Breakdown

### Task 1: Spike — prove in-process session spawning

- **Depends on**: none
- **Description**: From a throwaway extension tool, create an `AgentSession` via
  `createAgentSession` (using `ctx.modelRegistry`/`ctx.model`), `prompt()` it, capture
  output. Run **two sessions concurrently**.
- **Done when**: two sessions run at once from a single tool call and both return non-empty
  output. **Validates A1 — highest risk, goes first.**

### Task 2: Agent discovery

- **Depends on**: none
- **Description**: Adapt `agents.ts`: load markdown+frontmatter agents from user (and
  project with trust confirmation) directories; when `model` is absent, resolve to the
  parent model (`ctx.model`).
- **Done when**: `discoverAgents()` returns expected configs from fixtures; a missing
  `model` field resolves to the injected parent model.

### Task 3: Background registry + lifecycle

- **Depends on**: Task 1
- **Description**: `Map<runId, record>` registry keyed by `<agent-name>-<n>`. `launch`
  creates a session, subscribes to its events, buffers **assistant text + tool calls**,
  and calls `prompt()` **non-blocking**. Track status `running | done | error | stopped`.
  Reject `launch` when the running count is at the concurrency cap (8).
- **Done when**: `launch` returns an id immediately, the agent runs concurrently, status
  transitions are correct, and multiple agents run at once. **Validates A3.**

### Task 4: `background_agent` tool

- **Depends on**: Task 2, Task 3
- **Description**: Wire the action enum to the registry: `launch`, `send`, `status`,
  `collect`, `list`, `stop`. `collect` is non-blocking and returns `{ done, text }`.
- **Done when**: each action works; `send` reaches a running agent (validates A2);
  `collect` on a running agent returns `done: false`, and on a finished agent returns the
  final output with `done: true`; `stop` disposes the session; launching past the cap
  returns a clear rejection message.

### Task 5: Observability

- **Depends on**: Task 3
- **Description**: Always-on widget roster via `ctx.ui.setWidget` (compact live status) plus
  a `/agents [id]` command that lists agents and dumps a chosen agent's recent activity.
- **Done when**: the widget shows running agents and status live; `/agents` lists them;
  `/agents <id>` dumps that agent's recent streamed activity.

### Task 6: Shutdown cleanup

- **Depends on**: Task 3
- **Description**: On `session_shutdown`, dispose all live background sessions and remove
  their subscriptions/timers.
- **Done when**: quitting pi disposes every background session with no orphaned resources.

---

## Evaluation Criteria

### Deterministic Checks

Executed as **runnable scripts wired through a `package.json`** in the extension directory
(no full test harness).

| Check | Task | How to run | Pass condition |
|-------|------|------------|----------------|
| D1 Concurrent spawn | 1 | Script launches 2 sessions from a tool, awaits both | Both return non-empty output; total wall-time < sum of individual runtimes (proves concurrency) |
| D2 Discovery parses agents | 2 | Unit script on `discoverAgents()` against fixture `.md` files | Returns expected count; missing `model` resolves to injected parent model |
| D3 Launch is non-blocking | 3 | Script measures time from `launch` to returned id | Id returned in < 200ms while agent still `running` |
| D4 Status transitions | 3 | Script polls status through a short task | Observes `running` → `done` (and `error`/`stopped` on those paths) |
| D5 Follow-up delivered | 4 | Launch agent, `send` a message, `collect` | Final output reflects the follow-up content (A2 proof) |
| D6 Collect returns final | 4 | Launch short task, poll to done, `collect` | Returns the agent's final assistant text |
| D7 Stop disposes | 4 | Launch, `stop`, then `status` | Status `stopped`; session removed from registry |
| D7b Cap rejection | 4 | Launch 8 agents, attempt a 9th | 9th `launch` rejected with a message naming the cap and running count |
| D7c Non-blocking collect | 4 | `collect` a still-running agent | Returns `done: false` promptly without blocking |
| D8 Shutdown cleanup | 6 | Launch agents, trigger `session_shutdown`, assert | Registry empty; no dangling subscriptions/timers |
| D9 Type/lint | all | `tsc --noEmit` + linter on the extension | No errors |

### LLM-as-Judge Criteria

| Criterion | Task | Question | Evidence to examine | Scale (1–5) | Pass |
|-----------|------|----------|---------------------|-------------|------|
| J1 Model uses the interface correctly | 4 | In a realistic delegation, does the model correctly `launch` → `send` → `collect` without misusing the action enum? | Transcript of a session where the main agent delegates a background task and follows up | 5 = flawless lifecycle use; 3 = works but with a wrong/redundant action; 1 = fails to drive the loop | ≥ 4 |
| J2 Observability is legible | 5 | From the widget + `/agents [id]` output alone, can a user tell what is running and what a given agent is doing? | Live widget text and `/agents` / `/agents <id>` output during 2+ concurrent agents | 5 = status + activity both clear; 3 = status clear, activity vague; 1 = confusing | ≥ 4 |
| J3 Error & status messaging | 4 | On failure paths (bad agent name, invalid id, agent error, stop), does the tool return a message stating cause + what to do? | All error/edge outputs of the `background_agent` tool | 5 = cause + consequence + fix action; 3 = cause only; 1 = opaque | ≥ 4 |

**Note:** J1 is also the data source for the single-tool-vs-split-tools experiment. Repeated
J1 = 3 due to enum misuse is the signal to try separate tools.

### Verification Protocol

- **Adversarial**: The verifying model MUST be different from the implementing model.
- **Process**: The verifier (1) runs all deterministic checks (D1–D9 including D7b, D7c),
  (2) scores J1–J3 with
  cited evidence, (3) emits a pass/fail verdict per criterion, and (4) produces a concrete
  issues list for the implementer.
- A criterion with no evidence cited = automatic fail.

### Convergence

- **Quality floor**: all deterministic checks (D1–D9 including D7b, D7c) pass **and** J1, J2, J3 each ≥ 4.
- **Diminishing returns**: stop iterating when the last iteration flips **no** deterministic
  check to pass **and** improves **no** J-criterion by **≥ 1 point** (≥ 1 point = ≥ 20% of
  the 1–5 scale).
- **Max iterations**: 5.

---

## Outcome (completion record)

All 6 tasks passed. Deterministic checks D1–D9 (incl. D7b, D7c) green; LLM-as-judge
J1=5, J2=4, J3=4 (all ≥ 4). Adversarial verification used **github-copilot/gpt-5.4**
(different model family from the Claude implementer). J2 required one iteration (3 → 4):
agent purpose/task and live activity were added to the widget/roster/detail views.

**Key validations:**
- A1 (concurrent in-process `AgentSession`s) proven — wall≈max, not sum (D1).
- Re-contact preserves session context — agent recalled an earlier fact after a follow-up (D5).
- Recursion avoided — subagents load with an empty temp `agentDir`, so they do not
  re-load this extension (`background_agent` absent from subagent tool list; probed).
- Live end-to-end in pi: the main model drove `launch` → `collect` and reported the
  subagent's output.

**Deliverable:** `index.ts`, `registry.ts`, `tool.ts`, `agents.ts`, `session-factory.ts`,
`view.ts`, `checks/`. Originally implemented at `.pi/extensions/background-agents/`
(project-local); flattened to the repo root on 2026-07-05 so this repo could stand alone
as a publishable pi package (root `package.json`'s `pi` manifest now points at `index.ts`
directly). Run checks with `npm run check` from the repo root.
