# Changelog

All notable changes to this package are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions match `package.json`.

## 0.2.0

### Fixed (from adversarial code review)

- **`registry.ts`**: `send()` issued before a launched agent's session finished starting is
  now buffered and flushed in order once ready, instead of being silently dropped.
- **`registry.ts`**: `stop()`/`disposeAll()` now remove the isolated temp `agentDir` created
  for each session, fixing a per-launch disk leak.
- **`registry.ts`**: the per-agent activity buffer is capped at 200 items to bound memory
  for long-lived agents.
- **`session-factory.ts`**: each session is now tagged with its temp `agentDir` so the
  registry can clean it up.
- **`tool.ts`**: the `stop` action no longer throws uncaught on a TOCTOU race (run removed
  between the existence check and the stop call) — it now returns a clean error result like
  every other action.
- **`index.ts`**: agent discovery now covers both user- and project-scoped agents (behind a
  trust confirmation for project-sourced ones), fixing an under-delivered spec requirement
  where project agents were never surfaced.

### Fixed (root cause)

- **`session-factory.ts`**: an agent whose frontmatter omits `tools:` now defaults to all
  built-in tools (`read, bash, edit, write, grep, find, ls`) instead of an empty list. This
  was the root cause of an incident where a tool-less subagent hallucinated an entire fake
  session instead of reporting it had nothing to act with.

### Changed

- Flattened the extension from `.pi/extensions/background-agents/` to the repo root, so
  this repo can be installed directly as a standalone pi package (`pi install` resolves
  `package.json`'s `pi.extensions` manifest from the repo root).
- `check:fast` now also covers the four regression checks added by the review fixes above,
  plus agent discovery (`d2`, which needs no LLM and was previously misfiled under
  `check:llm`).

### Added

- MIT `LICENSE` file.
- Sample agent definitions (`agents/echoer.md`, `agents/coder.md`,
  `agents/reviewer-codex.md`) for users to copy into `~/.pi/agent/agents/`.

## 0.1.0

Initial release: the background, re-contactable subagents extension.

- `background_agent` tool with a single action enum (`launch`, `send`, `status`,
  `collect`, `list`, `stop`) backing an in-process registry of isolated `AgentSession`s.
- Subagents run with an empty temporary `agentDir` so they never recursively load this
  extension.
- `send()` re-prompts a persistent session (not a mid-run `steer()`), preserving context
  across follow-ups.
- Agent discovery via markdown + frontmatter definitions.
- Concurrency capped at 8 running agents; overflow is rejected with a clear message.
- Deterministic checks (`checks/d1.mjs`–`d8.mjs` and evidence generators) and the full
  specification in `specs/background-subagents.md`.
