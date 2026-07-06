# Spec: CI and Docs

> Goal: Make this repo safe and trustworthy for public consumption via automated CI and self-service documentation.
> Date: 2026-07-06
> Status: Complete (2026-07-06)

---

## What & Why

This repo (soon to be published at `github.com/yldgio/pi-background-agents`) currently has
no automated regression protection and documentation aimed at a repo owner, not a stranger.
Before it's shared publicly, it needs: CI that automatically guards the existing
adversarial-verification discipline on every change, and docs that let someone who has
never seen this project install, use, test, and contribute without asking the author
anything.

## Done Looks Like

- **CI**: every push to `main` and every pull request automatically runs `typecheck` and
  `check:fast`, with a pass/fail status visible on GitHub.
- **Docs**: reading only `README.md`, `CONTRIBUTING.md`, and `CHANGELOG.md`, a stranger can
  install the extension, use it, run its tests, and know how to propose a change.

---

## Scope

### In Scope

- **`package.json` readiness** — rename to `pi-background-agents`; add
  `repository`/`homepage`/`bugs` pointing at `github.com/yldgio/pi-background-agents`; add
  pinned `devDependencies` for the 6 SDK-adjacent packages so `npm install` alone (no
  `scripts/link-deps.sh`) resolves everything needed for `typecheck`/`check:fast`.
- **GitHub Actions CI workflow** (`.github/workflows/ci.yml`) — automatic gate running
  `typecheck` + `check:fast` on push to `main` and on all pull requests.
- **`CONTRIBUTING.md`** — how to propose changes, required local checks, when `check:llm`
  must be run locally, and the adversarial-verification discipline (verifier ≠ implementer).
- **`CHANGELOG.md`** — version history for `0.1.0` and `0.2.0`, grounded in real git history.
- **README updates** — CI status badge; replace placeholder install paths
  (`you/background-agents-pi`) with the real path everywhere.

### Out of Scope

- **NPM publish automation** — *no npm account/token exists yet for this package; automating
  publish to nowhere is premature.*
- **CI Node-version matrix** — *the repo hard-requires Node 24 for the check scripts'
  TypeScript type-stripping; there is nothing else to matrix against.*
- **Dependency/security scanning** (Dependabot, `npm audit`) — *the package has no real
  runtime dependencies yet (only `peerDependencies` on pi's own bundled packages); nothing
  meaningful to scan.*
- **`check:llm` as a CI workflow** — *real-model calls cost money per trigger and would
  require a pi-auth secret stored in GitHub, a security surface not justified by this
  repo's current scale. Documented as a local/manual step instead (Task 3).*
- **A new `docs/` folder or generated docs site** — *README + AGENTS.md + the spec already
  cover architecture; a separate docs tree risks duplicating the spec at this project's size.*
- **Enforcing "blocks merge on failure" via GitHub branch protection** — *this requires a
  manual step in GitHub's Settings → Branches UI (marking the check as a required status
  check), only possible after the workflow has run at least once on GitHub. Not achievable
  from repo files alone; flagged as a manual follow-up, not built here.*
- **Setting up the git remote / pushing to GitHub** — *deferred by the user in an earlier
  session; this spec prepares the repo but does not push it.*

---

## Constraints & Assumptions

### Hard Constraints

- CI platform is **GitHub Actions** (`.github/workflows/`).
- Node **24** required in CI (matches the type-stripping requirement already documented in
  AGENTS.md).
- Target repo path is `github.com/yldgio/pi-background-agents` (used in the badge,
  `package.json` fields, and README install examples).

### Assumptions

- **Pinned `devDependencies` stay compatible with the loose `peerDependencies` contract.**
  `pi-coding-agent`/`pi-ai`/`pi-agent-core`/`pi-tui` are pinned to `0.80.3` (their actual
  bundled version) and `typebox` to `1.1.38` (the version actually bundled with
  `pi-coding-agent@0.80.3`, not its own newer public `1.3.4`). A 6th package, `yaml@2.9.0`,
  was added during implementation: the CI-workflow validity check (Task 2) needed a real
  YAML parser, and `yaml` is likewise bundled with `pi-coding-agent` at a version matching
  its independent public-npm release — same pattern, no hand-rolled parser needed. — *If
  wrong (a later pi release changes SDK types in a breaking way): CI stays green against
  the stale pinned version while real consumers on newer pi could see different behavior.
  Mitigation: periodically bump the pin manually (no Dependabot, per Out of Scope).*
- **GitHub's hosted Ubuntu runners have outbound npm registry access.** — *Standard and
  essentially always true; if wrong, the `npm install` CI step fails immediately and
  visibly on the first run.*

---

## Decisions Already Made

| Decision | Rationale |
|----------|-----------|
| Rename npm package `background-agents-pi` → `pi-background-agents` | Match the real repo name; nothing published yet, so free to change |
| Real path `github.com/yldgio/pi-background-agents` used everywhere (badge, `repository`, README) | User confirmed this is the actual target repo |
| Pinned `devDependencies` mirror `peerDependencies` at exact bundled versions | Makes CI self-contained (`npm install` only); avoids `typebox` version drift found during specification |
| CI trigger: push to `main` + all pull requests | Standard "protect main branch" pattern |
| `check:llm` excluded from CI entirely; documented as a local/manual step | Real-model cost + secret-security surface not justified at this scale |
| No new `docs/` folder; polish existing README/AGENTS.md instead | Matches this repo's actual size (one extension, not a platform) |

---

## Task Breakdown

### Task 1: `package.json` readiness

- **Depends on**: none
- **Description**: Rename `"name"` to `pi-background-agents`; add `"repository"`,
  `"homepage"`, `"bugs"` fields pointing at `github.com/yldgio/pi-background-agents`; add a
  `"devDependencies"` block pinning `@earendil-works/pi-coding-agent@0.80.3`,
  `@earendil-works/pi-ai@0.80.3`, `@earendil-works/pi-agent-core@0.80.3`,
  `@earendil-works/pi-tui@0.80.3`, `typebox@1.1.38`, `yaml@2.9.0`.
- **Done when**: a clean-room `npm install` (no `scripts/link-deps.sh` run, no pre-existing
  global pi symlinks) followed by `npm run typecheck && npm run check:fast` succeeds.

### Task 2: CI workflow

- **Depends on**: Task 1
- **Description**: Add `.github/workflows/ci.yml` — triggers on push to `main` and on all
  pull requests; steps: checkout → setup-node (24) → `npm install` → `npm run typecheck` →
  `npm run check:fast`.
- **Done when**: the YAML is syntactically valid and its trigger/steps match the above; the
  same sequence of commands, run locally in a clean-room simulation, passes.

### Task 3: `CONTRIBUTING.md`

- **Depends on**: none
- **Description**: Document how to propose a change, which checks are required, when
  `check:llm` must be run locally (touching `registry.ts`, `session-factory.ts`, or
  `agents.ts`), and the adversarial-verification discipline (verifying model ≠ implementing
  model) already practiced in this repo.
- **Done when**: the file exists and covers all four topics above.

### Task 4: `CHANGELOG.md`

- **Depends on**: none
- **Description**: Document `0.1.0` (initial background-agents extension per the v1 spec)
  and `0.2.0` (post-review fixes + standalone-package restructure), grounded in the actual
  git history.
- **Done when**: the file exists, is non-empty, and accurately covers both versions.

### Task 5: README updates

- **Depends on**: Task 1, Task 2
- **Description**: Add a CI status badge referencing the new workflow; replace every
  placeholder install path (`you/background-agents-pi`) with the real
  `yldgio/pi-background-agents` path.
- **Done when**: the badge markdown is present and zero placeholder paths remain anywhere
  in the README.

---

## Evaluation Criteria

### Deterministic Checks

| Check | Task | How to run | Pass condition |
|-------|------|------------|-----------------|
| `package.json` correctness | 1 | Parse JSON; assert `name`, `repository`/`homepage`/`bugs`, and exact `devDependencies` versions | All fields present and correct |
| Clean-room install + checks | 1, 2 | Remove `node_modules`, do **not** run `link-deps.sh`, run `npm install && npm run typecheck && npm run check:fast` | All pass — the real proof CI will work on a fresh runner |
| CI workflow validity | 2 | Parse `.github/workflows/ci.yml` as YAML; assert trigger (`push: [main]`, `pull_request`) and step sequence | Valid YAML, correct trigger/steps |
| `CONTRIBUTING.md` completeness | 3 | Grep/read for: propose-a-change steps, required checks, `check:llm` trigger files, adversarial-verification mention | All four topics present |
| `CHANGELOG.md` completeness | 4 | Read; assert both `0.1.0` and `0.2.0` sections exist and are non-empty | Both versions covered |
| README correctness | 5 | Grep for CI badge markdown and for any remaining `you/background-agents-pi` occurrences | Badge present; zero placeholder occurrences |

### LLM-as-Judge Criteria

| Criterion | Task | Question | Evidence to examine | Scale | Pass boundary |
|-----------|------|----------|---------------------|-------|---------------|
| Stranger self-service | 3, 4, 5 | Reading only README.md + CONTRIBUTING.md + CHANGELOG.md (no other context), could a new user install, use, test, and contribute a change without asking anything? | The three files as they exist after implementation | 5 = complete, unambiguous, no guessing required; 3 = mostly clear but a real gap exists; 1 = confusing/incomplete | ≥ 4 |

### Verification Protocol

- **Adversarial**: The verifying model MUST be different from the implementing model (same
  discipline as the rest of this repo — see AGENTS.md).
- **Process**: Verifier runs all deterministic checks, scores the LLM-as-judge criterion
  with cited evidence, and produces a pass/fail verdict plus an issues list.

### Convergence

- **Quality floor**: all deterministic checks pass and the judge criterion scores ≥ 4.
- **Diminishing returns**: stop iterating when the last iteration improved the judge score
  by less than 1 point and flipped no deterministic check.
- **Max iterations**: 3 (smaller, more mechanical scope than the original extension build).

---

## Outcome (completion record)

All 5 tasks passed on the first attempt (5 tasks, 5 attempts total, 9/9 verification-log
entries passed, 0 failed).

- **cd-1 (package.json readiness)**: renamed to `pi-background-agents`, added
  `repository`/`homepage`/`bugs`, added 6 pinned `devDependencies` (a 6th, `yaml@2.9.0`,
  was added beyond the original 5 — discovered while writing Task 2's YAML-validity check;
  bundled with `pi-coding-agent` at the same version as its independent public-npm
  release, same pattern as `typebox`). Verified with a genuine clean-room `npm install`
  (239 packages) + `typecheck` + `check:fast`, not just a symlinked dev shortcut.
- **cd-2 (CI workflow)**: `.github/workflows/ci.yml`, triggers on push to `main` + all
  PRs, runs checkout → setup-node@24 → install → typecheck → check:fast. Validated by
  parsing the YAML and asserting trigger/step structure.
- **cd-3/cd-4/cd-5 (CONTRIBUTING.md, CHANGELOG.md, README updates)**: all deterministic
  checks passed; the joint LLM-judge criterion (J1, "stranger self-service") scored **4/5
  — PASS** against the ≥ 4 floor, verified by `github-copilot/gpt-5.3-codex` (different
  model family from the Claude session that implemented these changes). Verifier's noted
  gaps (not blocking): CONTRIBUTING.md defers some conventions to AGENTS.md; the
  `npm install` vs `scripts/link-deps.sh` choice is slightly ambiguous for a first-time
  contributor; no explicit pi-auth setup steps are given for `check:llm`. Left as-is per
  convergence rules (floor met on iteration 1; not chasing a 5).

**Environment note**: this repo lives on a 9p-mounted WSL2 drive (`/mnt/d/...`), which
makes `npm install`'s file-extraction phase slow (~11-12 minutes for `pi-coding-agent`'s
~239-package tree) even though registry fetches themselves are fast. This is a sandbox-
specific bottleneck (documented in `checks/d_clean_room.mjs`), not a defect in the
install itself or something expected on a real GitHub Actions runner (native ext4).

**Deferred by the user, not part of this spec's scope**: pushing this repo to the actual
`github.com/yldgio/pi-background-agents` remote (so the CI workflow and badge become
live) and enabling GitHub's branch-protection "required status checks" setting (only
possible after the workflow has run at least once on GitHub).
