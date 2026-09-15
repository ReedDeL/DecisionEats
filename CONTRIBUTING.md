# Contributing to DecisionEats

Thanks for helping improve DecisionEats. This guide covers the shared workflow for changes to the
product. The project documentation is the source of truth for architecture, product behavior, and
detailed coding standards.

## Before you start

1. Install Node.js 22 and npm.
2. Install the Python tooling described in `pyproject.toml` if you are working in `tools/`.
3. Install dependencies with `npm ci`.
4. Copy `.env.example` to `.env` and fill in only the values needed for local development. Never
   commit `.env` or third-party secrets.
5. Read the relevant document from [`docs/`](docs/README.md) before changing product behavior,
   architecture, data, or UI.

## Development commands

    npm run web             Start the web development build
    npm run check           Run lint, typecheck, tests, and formatting checks
    npm test                Run the test suite
    npm run format          Format supported source files

For a native build, use `npm run ios` or `npm run android` after completing the platform-specific
Expo setup. Changes to the catalog tooling should also pass the Ruff, mypy, and pytest checks
described in the style guide.

## Branches and commits

Use GitHub Flow: keep the default branch deployable, create a short-lived branch for each focused
change, and merge through a pull request.

Branch names use `<type>/<description>` in kebab-case:

    feat/equipment-filter
    fix/bucket-boundary
    docs/update-onboarding

Commit subjects are imperative, specific, capitalized, and fewer than 50 characters. For example:
`Add equipment filter`.

Keep unrelated work out of the branch. If the worktree already contains other changes, do not stage
or reformat them accidentally.

## Pull requests

Open a pull request with a concise summary, the reason for the change, exact verification steps, and
any remaining risk. CI must pass before merge, and a second founder must approve launch-critical
code. Squash merged branches and delete the branch afterward.

Review for correctness, security, structure, naming, accessibility, and maintainability. Use the
pull-request template as the minimum checklist.

## Repository safety

Keep repository automation limited to build, test, lint, formatting, and deployment checks. Do not
add hooks, workflows, scripts, or environment entries that post to or edit external communication or
project-management systems. External connector sessions are managed outside this repository.

## Local agent configuration

`AGENTS.md`, `.agents/`, and `docs/agentic/` are developer-local
configuration. Keep them ignored and out of pull requests. Shared product, architecture, security,
and contribution guidance belongs in this guide and the tracked documentation under `docs/`.

## Definition of done

A change is ready to merge when all applicable items are complete:

- Acceptance criteria are met.
- New logic has focused tests, including relevant boundary or failure cases.
- `npm run check` passes, plus the applicable Python checks for catalog tooling.
- New UI has loading, error, empty, and accessibility behavior where relevant.
- Secrets, generated local state, and unrelated edits are absent from the PR.
- User-facing, architectural, or environment changes are documented.
- UI changes have been manually checked on iOS and web when practical.

## Documentation

- [`docs/01_TECHNICAL_SPEC.md`](docs/01_TECHNICAL_SPEC.md): architecture and product constraints.
- [`docs/02_STYLE_GUIDE.md`](docs/02_STYLE_GUIDE.md): language and code style.
- [`docs/03_COLLABORATION_BLUEPRINT.md`](docs/03_COLLABORATION_BLUEPRINT.md): team workflow and
  Definition of Done.
- [`docs/04_UIUX_SPEC.md`](docs/04_UIUX_SPEC.md): screens and interaction rules.
- [`docs/06_API_KEYS_AND_ENV.md`](docs/06_API_KEYS_AND_ENV.md): environment and secret handling.

Durable product or architecture decisions belong in `docs/`. Personal notes, editor settings, and
local coding-tool instructions do not belong in the repository.

## Reporting security issues

Do not open a public issue for a suspected vulnerability or expose credentials in a pull request.
Use the repository's private security-reporting channel and rotate any credential that may have been
exposed.
