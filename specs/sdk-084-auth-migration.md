# Spec: SDK 0.84.1 Auth Migration

> Goal: Restore auth inheritance for subagent sessions after SDK API change
> Date: 2025-08-08
> Status: Active — implemented, pending `check:llm` verification

---

## What & Why

The pi SDK refactored its session-creation API between v0.80.3 and v0.84.1, replacing the
`authStorage: AuthStorage` + `modelRegistry: ModelRegistry` options on `createAgentSession()`
with a single unified `modelRuntime: ModelRuntime`. This extension still passes the old
options, which the new SDK silently ignores — so subagent sessions get a brand-new, empty
`ModelRuntime` (credentials pointed at a non-existent `auth.json` in a temp directory) and
fail with "github copilot token missing" (or equivalent for any OAuth/API-key provider).

## Done Looks Like

- Background agents inherit the parent session's auth context (OAuth tokens, API keys) and
  can make API calls to any provider the parent can reach — including GitHub Copilot.
- The extension compiles and runs cleanly against the current SDK (0.84.1).
- All existing deterministic and LLM-backed checks pass.

---

## Scope

### In Scope

- `session-factory.ts` — replace removed `authStorage`/`modelRegistry` options with `modelRuntime`
- `index.ts` — extract `ModelRuntime` from extension context and pass it to the session factory
- `package.json` — bump SDK devDependencies from 0.80.3 to 0.84.1
- `checks/_helpers.mjs` and `checks/d1.mjs` — update to use new SDK API (`ModelRuntime.create()`)

### Out of Scope

- New features (dynamic agent creation, persistence, etc.) — *not related to the bug*
- Refactoring `resolveModel()` beyond what's needed — *surgical; only swap `find` → `getModel`*
- Upgrading other SDK usage patterns that aren't broken — *touch only what you must*
- Any other check files — *only `_helpers.mjs` and `d1.mjs` use the removed APIs*

---

## Constraints & Assumptions

### Hard Constraints

- **No runtime transforms** in files imported by `.mjs` checks — no `enum`, parameter
  properties, or `namespace` (Node strip-only mode)
- **Tabs for indentation** — match existing files
- **Subagent isolation is load-bearing** — the empty temp `agentDir` pattern must remain;
  only the auth injection mechanism changes
- **Extension runs inside pi's process (jiti)** — uses the globally installed SDK at
  runtime (0.84.1), not devDependencies
- **No subagents/background agents available** — all implementation and verification must
  run inline in the main session (the extension itself is broken until fixed)

### Assumptions

- **A1 (verified)**: `ctx.modelRegistry` in SDK 0.84.1 is a `ModelRegistry` facade wrapping
  `ModelRuntime`, accessible via the private `runtime` field
- **A2 (verified)**: `createAgentSession()` in 0.84.1 accepts `modelRuntime?: ModelRuntime`
  and uses it for all auth resolution; falls through to `ModelRuntime.create()` only when
  undefined
- **A3 (verify during implementation)**: The parent's `ModelRuntime` instance is safe to
  share across sessions (parent + subagents) — no conflicting mutable state. *If wrong:
  would need to clone or create a derived runtime pointing at the same credential store.*

---

## Decisions Already Made

| Decision | Rationale |
|----------|-----------|
| Subagent isolation via empty temp `agentDir` | Prevents recursive extension loading (documented, load-bearing) |
| `ModelRuntime` replaces `AuthStorage` + `ModelRegistry` in SDK 0.84.1 | SDK refactor — not our choice, must adapt |
| `ModelRegistry` in 0.84.1 is a facade wrapping `ModelRuntime` | Extension context still exposes `ctx.modelRegistry`; runtime is underneath |
| Fake-backed checks (`check:fast`) don't touch SDK auth | They use `fakeFactory` — won't break from session-factory interface changes |
| Only `_helpers.mjs` and `d1.mjs` use removed APIs | Verified by grep; all other checks use fake factories or don't touch SDK auth |

---

## Task Breakdown

### Task 1: Bump SDK devDependencies to 0.84.1

- **Depends on**: none
- **Description**: Update `package.json` devDependencies from `0.80.3` to match the
  installed runtime (`0.84.1`). Run `scripts/link-deps.sh` to re-link.
- **Done when**: `bash scripts/link-deps.sh` succeeds. `npm run typecheck` runs (may
  produce errors — that's expected and confirms we're compiling against the new API surface)

### Task 2: Update `session-factory.ts` to use `modelRuntime`

- **Depends on**: Task 1
- **Description**: Replace `RealFactoryDeps.modelRegistry` and `RealFactoryDeps.authStorage`
  with `modelRuntime`. Pass `modelRuntime: deps.modelRuntime` to `createAgentSession()`
  instead of the removed `authStorage`/`modelRegistry`. Update `resolveModel()` to use
  `ModelRuntime.getModel(provider, id)` instead of `ModelRegistry.find(provider, id)`.
  Keep the `parentModel` inheritance fallback path.
- **Done when**: `session-factory.ts` compiles cleanly against SDK 0.84.1 types

### Task 3: Update `index.ts` to extract and pass `ModelRuntime`

- **Depends on**: Task 2
- **Description**: In `getRegistry()`, extract the `ModelRuntime` from `ctx.modelRegistry`
  (the facade's `.runtime` field) and pass it to `createRealSessionFactory()` as
  `modelRuntime`. Remove the now-unused `authStorage` reference.
- **Done when**: `npm run typecheck` passes fully

### Task 4: Update `checks/_helpers.mjs` and `checks/d1.mjs`

- **Depends on**: Task 2
- **Description**: Both files use `AuthStorage.create()` + `ModelRegistry.create(authStorage)`
  which no longer exist in 0.84.1. Update to use `ModelRuntime.create()` and pass
  `modelRuntime` to `createRealSessionFactory()`. Update `d1.mjs` to use
  `ModelRuntime.create()` and pass `modelRuntime` to `createAgentSession()`.
- **Done when**: `npm run check:fast` passes, `npm run check:llm` passes

---

## Evaluation Criteria

### Deterministic Checks

| Check | Task | How to run | Pass condition |
|-------|------|------------|----------------|
| SDK links cleanly | 1 | `bash scripts/link-deps.sh` | Exit 0 |
| Typecheck passes | 1–3 | `npm run typecheck` | Exit 0, no errors |
| Fast checks pass | 2–4 | `npm run check:fast` | All checks exit 0 |
| `session-factory.ts` passes `modelRuntime` | 2 | `grep 'modelRuntime' session-factory.ts` | Option appears in `createAgentSession()` call |
| `session-factory.ts` no longer passes removed options | 2 | `grep -c 'authStorage:\|modelRegistry:' session-factory.ts` in `createAgentSession` args | Neither `authStorage:` nor `modelRegistry:` passed as options |
| `index.ts` extracts runtime | 3 | `grep 'runtime' index.ts` | `ModelRuntime` or `.runtime` accessed from `ctx.modelRegistry` |
| Checks don't use removed APIs | 4 | `grep -c 'ModelRegistry.create\|ModelRegistry.inMemory' checks/*.mjs` | Zero matches |

### LLM-as-Judge Criteria

| Criterion | Task | Question | Evidence to examine | Scale | Pass boundary |
|-----------|------|----------|---------------------|-------|---------------|
| Surgical change | All | Do the changes touch ONLY what's needed for the auth fix? No unrelated refactors, no new features, no style changes? | `git diff` of all modified files | 1–5 (5 = purely surgical) | ≥ 4 |
| Assumption A3 safety | 2–3 | Is the shared `ModelRuntime` instance used safely — no mutation of credentials, no conflicting state between parent and subagent? | `session-factory.ts`, `index.ts`, SDK `ModelRuntime` source | 1–5 (5 = clearly safe, no shared mutable state risk) | ≥ 4 |

### Verification Protocol

- **Adversarial**: The verifying model MUST be different from the implementing model.
- **Process**: Verifier evaluates every criterion above, produces pass/fail with evidence
  for each, and identifies issues for the implementer.

### Convergence

- **Quality floor**: All deterministic checks pass. All LLM-as-judge criteria meet their
  pass boundary (≥ 4).
- **Diminishing returns**: Stop when the last iteration improved no criterion.
- **Max iterations**: 3
