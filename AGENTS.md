# AGENTS.md

Base instructions for an AI agent working in this repository.

## What this project is

A single pi extension: **background, re-contactable subagents**
(`.pi/extensions/background-agents/`). The model launches named subagents on tasks; they run
as isolated in-process `AgentSession`s and can be re-contacted (`send`), polled (`status`),
and collected (`collect`). Full spec and verification record:
[`specs/background-subagents.md`](specs/background-subagents.md).

## Layout

| Path | What it is |
|------|-----------|
| `.pi/extensions/background-agents/` | The extension (the deliverable) |
| `.pi/extensions/background-agents/checks/` | Deterministic check scripts + fixtures + evidence generators |
| `specs/background-subagents.md` | The living spec: scope, decisions, evaluation criteria, outcome |
| `scripts/link-deps.sh` | Links the pi SDK into `./node_modules` so checks resolve imports |
| `.agents/skills/` | Vendored workflow skills (`specify`, `implement-spec`, …) |

## How to verify changes

```bash
bash scripts/link-deps.sh            # once, so standalone scripts resolve @earendil-works/* and typebox
cd .pi/extensions/background-agents
npm run typecheck                    # tsc --noEmit — must be clean
npm run check:fast                   # fake-backed, deterministic, no LLM
npm run check:llm                    # real model calls; needs pi auth
```

Always run `typecheck` and `check:fast` after edits. Run `check:llm` when touching the
session factory, registry run loop, or agent discovery.

## Conventions and gotchas (read before editing)

- **No TypeScript features that require runtime transforms** in files imported by the
  `.mjs` checks (`registry.ts`, `tool.ts`, `agents.ts`, `session-factory.ts`, `view.ts`).
  Node's strip-only mode rejects parameter properties, `enum`, and `namespace`. Use plain
  fields and `export const` objects instead. `index.ts` is loaded by pi (jiti) and is less
  constrained, but keep it clean.
- **Indentation is tabs** (match existing files).
- **Subagent isolation is load-bearing:** `session-factory.ts` points each subagent's
  `DefaultResourceLoader` at an empty temp `agentDir` so subagents do NOT recursively load
  this extension. Do not change this to the project `agentDir`.
- **`send` uses a queued re-prompt** on the persistent session (not mid-run `steer`). This
  is intentional and deterministic; it preserves context across follow-ups. Preserve this
  semantics unless the spec's assumption A2 is revisited.
- **State is in-memory, process-lifetime only.** No disk persistence of running agents.
- The registry is decoupled from the SDK via an **injected `SessionFactory`** — use fake
  factories for deterministic tests and the real factory for A1/A2 proofs.
- `.implement-spec/` (state DB + evidence) and `node_modules/` are gitignored and transient.

## Verification discipline

This repo was built with adversarial verification: the implementing model is **not** the
verifying model. When adding evaluation criteria or re-verifying, keep that separation
(e.g., verify with a different model family than the one that wrote the code). Evaluation
criteria and pass boundaries live in `specs/background-subagents.md`.

## Scope

In scope: the v1 background/re-contactable foundation. **Out of scope** (deferred phases,
do not add without updating the spec): dynamic agent creation from DB/files, full context
inheritance / dynamic model injection, user-facing launch commands, cross-session/restart
persistence.
