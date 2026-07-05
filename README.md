# Background Agents — a pi extension

Delegate work to **background, re-contactable subagents**. The main agent (the model)
launches a named subagent on a task, keeps working while it runs concurrently, then sends
follow-ups, checks status, and collects results — all through a single tool. Users get a
read-only live view of what's running.

Each subagent is a live, isolated **in-process `AgentSession`** (SDK `createAgentSession`),
tracked in a registry for the lifetime of the pi process. Agents are defined as
markdown + frontmatter, and inherit the main agent's model when none is specified.

> Status: v1 (foundation). Built and verified via the `specify` → `implement-spec` workflow.
> See [`specs/background-subagents.md`](specs/background-subagents.md) for the full spec and
> verification record.

## Features

- **Background delegation** — `launch` returns a run id immediately; the agent runs concurrently.
- **Re-contactable** — `send` a follow-up to a running or finished agent; its session context
  is preserved (a follow-up can reference earlier turns).
- **Collect / status / list / stop** — non-blocking; `collect` reports `done` vs. still-running.
- **Concurrency cap** (8) with a clear rejection message.
- **Read-only observability** — an always-on widget roster plus `/agents [id]` to inspect one
  agent's task and recent activity.
- **Markdown agent definitions** with per-agent system prompt, tools, and optional model.

## Requirements

- [pi](https://pi.dev) installed (provides the SDK the extension imports).
- Node.js 24+ (the standalone check scripts use built-in `node:sqlite` and TypeScript
  type-stripping).

## Install / Use

The extension lives at `.pi/extensions/background-agents/`, so pi **auto-discovers it as a
project-local extension** once the project is trusted.

```bash
# from the repo root
pi -a          # -a trusts project-local files for this run (or trust when prompted)
```

Then just talk to the main agent. Example prompts:

```
Launch the 'scout' agent in the background to find all auth code, then keep helping me.
Check on the background agents.           # model calls action:list / status
Tell scout-1 to also look at the session store.   # model calls action:send
Collect scout-1's result.                 # model calls action:collect
```

As a user you can observe (read-only):

- The **widget** above the editor shows the live roster (`⏳ scout-1 (scout) 2t 14s · Find …`).
- `/agents` lists all background agents; `/agents scout-1` shows that agent's task + recent activity.

### Defining agents

Create markdown files with YAML frontmatter in `~/.pi/agent/agents/` (user scope, always
loaded):

```markdown
---
name: scout
description: Fast codebase recon
tools: read, grep, find, ls
model: github-copilot/claude-haiku-4.5   # optional; omit to inherit the main agent's model
---

You are scout. Find things quickly and report compressed findings.
```

- `name`, `description` — required.
- `tools` — optional comma-separated built-in tool allowlist; **omit to enable all
  built-in tools** (`read, bash, edit, write, grep, find, ls`) rather than none.
- `model` — optional `provider/id`; when omitted the subagent **inherits the main model**.
- Body — the subagent's system prompt.

### The `background_agent` tool (actions)

| action    | required params        | behavior |
|-----------|------------------------|----------|
| `launch`  | `agent`, `task`        | Start a background agent; returns a run id immediately. |
| `send`    | `runId`, `message`     | Queue a follow-up on that agent's session (context preserved). |
| `status`  | `runId?`               | One agent, or the whole roster if omitted. |
| `collect` | `runId`                | Non-blocking; returns final text, or "still running". |
| `list`    | —                      | The roster. |
| `stop`    | `runId`                | Abort and dispose the agent. |
| (any)     | `modelId?`             | Override the model for `launch`. |

## Test

The extension ships deterministic check scripts (`checks/D*.mjs`) and evidence generators.

```bash
# one-time: link the pi SDK into ./node_modules so standalone scripts resolve imports
bash scripts/link-deps.sh

cd .pi/extensions/background-agents

npm run typecheck     # tsc --noEmit
npm run check:fast    # D3,D4,D7,D7b,D7c,D8 — fake-backed, no LLM, fast & deterministic
npm run check:llm     # D2,D1,D6,D5 — real model calls (needs pi auth); validates A1/A2
npm run check         # all of the above
```

What the checks prove:

- **D1** — multiple concurrent in-process sessions run truly in parallel (wall ≈ max, not sum).
- **D2** — agent discovery parses frontmatter; missing `model` inherits the parent model.
- **D3/D4** — `launch` is non-blocking; status transitions `running → done`.
- **D5** — re-contacting an agent preserves session context (it recalls an earlier fact).
- **D6** — `collect` returns the final output once done.
- **D7/D7b/D7c** — stop disposes; the 9th launch is rejected; `collect` never blocks.
- **D8** — shutdown disposes every live session.

## Package (share it)

The extension is a self-contained pi package (`.pi/extensions/background-agents/`).

1. Make `package.json` publish-ready — it already declares the `pi` manifest, the
   `pi-package` keyword, and the pi core packages as `peerDependencies` (`"*"`, never
   bundle them). Set a real `version`, `repository`, and remove `private` before publishing.
2. Distribute and install by any pi source:

   ```bash
   pi install npm:background-agents-pi           # after npm publish
   pi install git:github.com/you/background-agents
   pi install ./.pi/extensions/background-agents  # local path
   pi -e ./.pi/extensions/background-agents        # try for one run only
   ```

3. Bundle the sample agents by adding an `agents/` dir and shipping them, or document that
   users drop agent markdown into `~/.pi/agent/agents/`.

See pi's `docs/packages.md` for npm/git sources, filtering, and gallery metadata.

## Architecture

```
.pi/extensions/background-agents/
├── index.ts            # registers the tool, widget, /agents command, shutdown cleanup
├── registry.ts         # BackgroundRegistry — lifecycle, serialized run queue, cap
├── tool.ts             # runAction — the action-enum dispatcher (pure, testable)
├── agents.ts           # markdown+frontmatter discovery + parent-model inheritance
├── session-factory.ts  # wires the registry to createAgentSession (isolated, in-memory)
├── view.ts             # widget/roster/detail formatting (pure)
└── checks/             # deterministic checks + fixtures + evidence generators
```

**Key decisions** (see the spec): in-process sessions (only way to re-contact a running
agent); `send` implemented as a **queued re-prompt on the persistent session** (deterministic,
context-preserving); subagents load with an empty temp `agentDir` so they never recursively
re-load this extension; process-lifetime in-memory state only.

## Roadmap (deferred phases)

- Phase 2: dynamic agent creation (DB or files) at runtime.
- Phase 3: full context inheritance and dynamic model injection.
- User-facing launch/interact commands (currently model-driven; users are read-only).
