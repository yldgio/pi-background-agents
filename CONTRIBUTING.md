# Contributing

Thanks for considering a change to this extension. This is a small, single-purpose
package, so the process is intentionally light — but the quality bar is not.

## Proposing a change

1. Open an issue or a pull request describing what you want to change and why.
2. Keep pull requests focused — one logical change per PR, with a clear description of
   what and why (see AGENTS.md's "Surgical Changes" discipline: touch only what the change
   requires).
3. Follow the existing conventions before writing code — read [`AGENTS.md`](AGENTS.md)
   first, especially "Conventions and gotchas." It documents real incidents (like the
   default-tools bug) so they don't get reintroduced.
4. Commits should be atomic and use
   [Conventional Commits](https://www.conventionalcommits.org/) style (`feat:`, `fix:`,
   `docs:`, `test:`, `chore:`, `refactor:`), matching this repo's existing history
   (`git log --oneline`).

## Required checks before opening a PR

```bash
npm install          # or: bash scripts/link-deps.sh, if you already have pi installed globally
npm run typecheck     # tsc --noEmit — must be clean
npm run check:fast     # fake-backed, deterministic, no LLM — must pass
```

These two are also enforced automatically by CI on every push and pull request.

### When you must also run `check:llm`

`check:llm` makes real model calls (it needs pi auth configured locally) and is **not**
run in CI — see [Scope](specs/ci-and-docs.md#out-of-scope) for why. Run it yourself,
locally, whenever your change touches:

- `registry.ts`
- `session-factory.ts`
- `agents.ts`

These are the files that talk to the real SDK (`AgentSession` creation, concurrent
sessions, re-contact/`send` semantics). `check:fast` only proves the registry's own logic
is correct against fakes — `check:llm` is the only thing that proves the real integration
still behaves as assumed. A change to these files should not be merged without a green
`npm run check:llm`.

```bash
npm run check:llm
```

## Adversarial verification discipline

This repo was built, and is maintained, with **adversarial verification**: the model (or
person) that implements a change is never the one that verifies it meets the evaluation
criteria. If you're using an AI coding agent to prepare a change and then to review it,
use a genuinely different model for the review — reviewing your own work with the same
model that wrote it is not verification. This applies to both code changes and
documentation changes with LLM-as-judge criteria (see the specs in `specs/` for examples).

## Where things are documented

- [`AGENTS.md`](AGENTS.md) — architecture, layout, conventions, and gotchas for anyone
  (human or AI agent) editing this codebase.
- [`specs/background-subagents.md`](specs/background-subagents.md) — the living spec for
  the extension itself: scope, decisions, evaluation criteria.
- [`specs/ci-and-docs.md`](specs/ci-and-docs.md) — the living spec for CI and this
  documentation set.
- [`README.md`](README.md) — install and usage instructions for consumers of the package.
