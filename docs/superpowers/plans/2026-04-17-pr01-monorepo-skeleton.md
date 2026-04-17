# PR #1 — Monorepo skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate pixflow from a single-package repo (`src/` at root) to a pnpm monorepo under `packages/`, with empty skeleton packages for the future editor and editor-ml. pixflow library builds and tests must continue to work identically. The `examples/vanilla-js` demo and the landing page must continue to run.

**Architecture:** This is a pure refactor PR — no new features. Existing files move via `git mv`; root `package.json` is split into a workspace-root manifest plus `packages/pixflow/package.json`. pnpm workspace config is updated to glob `packages/*` and `examples/*`. Future packages (`editor`, `editor-ml`) are created as empty skeleton `package.json` files only. Landing moves from `landing/` to `packages/landing/` for a uniform layout.

**Tech Stack:** pnpm workspaces, tsup, vitest, TypeScript 5.6+, Vite (demo), git mv for history preservation.

**Spec reference:** `docs/superpowers/specs/2026-04-17-pixflow-editor-architecture-design.md` (Section 1, Section 7 Phase 1–4).

**Acceptance criteria for this PR:**

1. `pnpm --filter pixflow build` produces the same `dist/` bundle (same files, same entry points) as before migration.
2. `pnpm --filter pixflow test` runs the same number of tests (all pass).
3. `pnpm --filter pixflow typecheck` passes.
4. `pnpm --filter @pixflow-examples/vanilla-js dev` starts the demo on port 5173.
5. `pnpm --filter landing dev` starts the landing page on port 5174.
6. `packages/editor/` and `packages/editor-ml/` exist as empty skeletons (package.json only, marked `"private": true`).
7. All git history for moved files is preserved (verifiable via `git log --follow`).

---

## File structure after this PR

```
pixflow/                                    ← repo root (workspace only)
├── package.json                            ← REWRITTEN: workspace-only manifest
├── pnpm-workspace.yaml                     ← REWRITTEN: packages/* + examples/*
├── .gitignore                              ← unchanged
├── LICENSE, README.md                      ← unchanged
├── docs/superpowers/                       ← unchanged (spec + this plan live here)
├── packages/
│   ├── pixflow/                            ← the library, moved from root
│   │   ├── package.json                    ← NEW (pixflow-specific fields)
│   │   ├── tsconfig.json                   ← MOVED from root
│   │   ├── tsconfig.build.json             ← MOVED from root
│   │   ├── tsup.config.ts                  ← MOVED from root
│   │   ├── vitest.config.ts                ← MOVED from root
│   │   ├── eslint.config.js                ← MOVED from root
│   │   ├── src/                            ← MOVED from root/src/
│   │   └── test/                           ← MOVED from root/test/
│   ├── editor/                             ← NEW empty skeleton
│   │   └── package.json                    ← NEW, marker only
│   ├── editor-ml/                          ← NEW empty skeleton
│   │   └── package.json                    ← NEW, marker only
│   └── landing/                            ← MOVED from root/landing/
│       └── (all landing files unchanged)
└── examples/
    └── vanilla-js/
        ├── package.json                    ← NEW (workspace member with pixflow dep)
        ├── vite.config.ts                  ← MOVED from root/vite.config.ts (path updated)
        ├── tsconfig.json                   ← MODIFIED (path mapping updated)
        ├── index.html, main.ts, style.css, zip.ts   ← unchanged
```

**Files deleted from the root in this PR:**

- `src/` (moved to `packages/pixflow/src/`)
- `test/` (moved to `packages/pixflow/test/`)
- `tsconfig.json` (moved)
- `tsconfig.build.json` (moved)
- `tsup.config.ts` (moved)
- `vitest.config.ts` (moved)
- `eslint.config.js` (moved)
- `vite.config.ts` (moved to `examples/vanilla-js/vite.config.ts`)
- `landing/` (moved to `packages/landing/`)

**Files unchanged:**

- `.gitignore`, `.prettierrc`, `.prettierignore`, `LICENSE`, `README.md`
- `examples/vanilla-js/index.html`, `main.ts`, `style.css`, `zip.ts`, `tsconfig.json` (tsconfig gets a path-map edit but not a move)

---

## Task 1: Prepare working tree and create feature branch

**Files:** none (operational setup)

**Context:** The repo currently has pre-existing modified files (README, card-view fix work, landing hook refactor, error test changes). These must be resolved BEFORE starting the migration so the PR diff is clean.

- [ ] **Step 1.1: Inspect current git state**

Run:
```bash
git status --short
git log --oneline -5
```

Expected: a list of `M` / `??` files, most recent commit `88840fd docs: add pixflow editor architecture design spec`.

- [ ] **Step 1.2: Decide on pre-existing modifications**

The modifications are unrelated to this migration. Two options:

**Option A (recommended):** Commit them as a separate "pre-migration cleanup" commit:
```bash
git add README.md examples/vanilla-js/main.ts examples/vanilla-js/style.css \
        landing/src/hooks/usePrefersReducedMotion.ts \
        src/codec/readback.ts src/errors.ts src/video/video-processor.ts \
        test/errors.test.ts test/video-processor.test.ts test/readback.test.ts \
        pnpm-workspace.yaml
git commit -m "chore: pre-migration cleanup (unrelated fixes)"
```

**Option B:** Stash them for later:
```bash
git stash push -u -m "pre-migration wip"
```

Pick one. If unclear, ask the user. Do NOT proceed until working tree is clean.

- [ ] **Step 1.3: Verify working tree is clean**

Run:
```bash
git status --short
```

Expected: **no output** (empty = clean tree).

- [ ] **Step 1.4: Create feature branch**

Run:
```bash
git checkout -b feature/monorepo-pr01-skeleton
git branch --show-current
```

Expected output: `feature/monorepo-pr01-skeleton`

---

## Task 2: Verify baseline build, test, typecheck work before changes

**Files:** none (verification only)

**Context:** We need a known-good baseline so any post-migration regression is clearly caused by the migration, not by pre-existing breakage.

- [ ] **Step 2.1: Clean install from current state**

Run:
```bash
pnpm install
```

Expected: no errors, finishes in <60s. If this fails, STOP — pre-existing issue must be fixed first.

- [ ] **Step 2.2: Run typecheck**

Run:
```bash
pnpm typecheck
```

Expected: either (a) clean pass, or (b) the known pre-existing errors from `examples/vanilla-js/main.ts` (`requestAdapterInfo`, `compare possibly null`) — record which. The post-migration run must produce the **same** set of errors, no new ones.

- [ ] **Step 2.3: Run tests**

Run:
```bash
pnpm test 2>&1 | tee /tmp/pixflow-baseline-tests.log
```

Note the number of test files and passing tests at the bottom. This is the baseline we'll compare against after migration.

- [ ] **Step 2.4: Run build and snapshot dist/ listing**

Run:
```bash
pnpm build
ls -la dist/ > /tmp/pixflow-baseline-dist.txt
cat /tmp/pixflow-baseline-dist.txt
```

Expected: `dist/` contains `index.js`, `index.cjs`, `index.d.ts`, `index.d.cts`, plus `.map` files. Snapshot saved for post-migration comparison.

---

## Task 3: Create monorepo directory skeletons

**Files:**
- Create: `packages/pixflow/` (directory)
- Create: `packages/editor/` (directory)
- Create: `packages/editor-ml/` (directory)

- [ ] **Step 3.1: Create the target directories**

Run:
```bash
mkdir -p packages/pixflow packages/editor packages/editor-ml
ls packages/
```

Expected output:
```
editor
editor-ml
pixflow
```

Git does not track empty directories, but they'll be populated by subsequent tasks.

---

## Task 4: Move pixflow source and test files

**Files:**
- Move: `src/` → `packages/pixflow/src/`
- Move: `test/` → `packages/pixflow/test/`

- [ ] **Step 4.1: Move the source tree**

Run:
```bash
git mv src packages/pixflow/src
```

- [ ] **Step 4.2: Move the test tree**

Run:
```bash
git mv test packages/pixflow/test
```

- [ ] **Step 4.3: Verify history preserved**

Run:
```bash
git log --follow --oneline -3 packages/pixflow/src/pipeline/pipeline.ts
```

Expected: at least 2–3 commits shown, including old commits (history preserved across move).

- [ ] **Step 4.4: Verify structure**

Run:
```bash
ls packages/pixflow/
```

Expected output:
```
src
test
```

---

## Task 5: Move pixflow config files

**Files:**
- Move: `tsconfig.json` → `packages/pixflow/tsconfig.json`
- Move: `tsconfig.build.json` → `packages/pixflow/tsconfig.build.json`
- Move: `tsup.config.ts` → `packages/pixflow/tsup.config.ts`
- Move: `vitest.config.ts` → `packages/pixflow/vitest.config.ts`
- Move: `eslint.config.js` → `packages/pixflow/eslint.config.js`

These configs all use relative paths (`./src`, `./test`) so they don't need editing after the move — the paths resolve correctly from the new location.

- [ ] **Step 5.1: Move all pixflow configs in one go**

Run:
```bash
git mv tsconfig.json packages/pixflow/tsconfig.json
git mv tsconfig.build.json packages/pixflow/tsconfig.build.json
git mv tsup.config.ts packages/pixflow/tsup.config.ts
git mv vitest.config.ts packages/pixflow/vitest.config.ts
git mv eslint.config.js packages/pixflow/eslint.config.js
```

- [ ] **Step 5.2: Verify the files moved**

Run:
```bash
ls packages/pixflow/
ls *.config.* 2>/dev/null || echo "no configs left at root (expected)"
```

Expected output (first line):
```
eslint.config.js
src
test
tsconfig.build.json
tsconfig.json
tsup.config.ts
vitest.config.ts
```

Second line: `no configs left at root (expected)` OR `vite.config.ts` (we move this in Task 8).

---

## Task 6: Create packages/pixflow/package.json

**Files:**
- Create: `packages/pixflow/package.json`

The new pixflow package.json contains only pixflow-specific fields. Scripts are scoped (removed `dev`/`dev:demo` — those belong to the demo package now).

- [ ] **Step 6.1: Write the new package.json**

Create `packages/pixflow/package.json` with exactly this content:

```json
{
  "name": "pixflow",
  "version": "0.1.0-prototype",
  "description": "WebGPU-based browser image processing library",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "dist",
    "LICENSE",
    "README.md"
  ],
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\""
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@webgpu/types": "^0.1.52",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.3.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "keywords": [
    "webgpu",
    "image-processing",
    "image",
    "gpu",
    "resize",
    "filter",
    "pipeline",
    "browser"
  ],
  "engines": {
    "node": ">=20"
  }
}
```

**Note:** `vite` is NOT a dependency here — pixflow library doesn't need Vite. It moves to the demo package's devDependencies in Task 8.

---

## Task 7: Rewrite root package.json as workspace manifest

**Files:**
- Modify: `package.json`

- [ ] **Step 7.1: Replace root package.json with workspace-only content**

Overwrite `/Users/buraksahin/Desktop/pixflow-latest/package.json` with:

```json
{
  "name": "pixflow-workspace",
  "version": "0.0.0",
  "private": true,
  "description": "Pixflow monorepo root (workspace only, not published)",
  "type": "module",
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "format": "prettier --write \"packages/*/src/**/*.{ts,tsx,html,css}\" \"examples/*/*.{ts,tsx,html,css}\"",
    "format:check": "prettier --check \"packages/*/src/**/*.{ts,tsx,html,css}\" \"examples/*/*.{ts,tsx,html,css}\"",
    "dev:demo": "pnpm --filter @pixflow-examples/vanilla-js dev",
    "dev:landing": "pnpm --filter landing dev"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**What changed vs. the original:**
- `name` → `pixflow-workspace`, `private: true` (not published)
- No `main` / `module` / `exports` / `files` (not a package)
- Scripts use `pnpm -r` (recursive) for repo-wide ops, or `pnpm --filter` for specific packages
- All `devDependencies` moved to `packages/pixflow/package.json`
- `keywords` removed (workspace is not an npm package)

---

## Task 8: Set up examples/vanilla-js as a workspace package

**Files:**
- Create: `examples/vanilla-js/package.json`
- Move + modify: `vite.config.ts` → `examples/vanilla-js/vite.config.ts`
- Modify: `examples/vanilla-js/tsconfig.json`

- [ ] **Step 8.1: Move vite.config.ts to examples**

Run:
```bash
git mv vite.config.ts examples/vanilla-js/vite.config.ts
```

- [ ] **Step 8.2: Rewrite the moved vite.config.ts with new paths**

Overwrite `examples/vanilla-js/vite.config.ts` with:

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The demo consumes the pixflow library from source (not built output) for
// fast iteration. The workspace-level dependency `"pixflow": "workspace:*"`
// keeps type resolution honest; Vite's alias bypasses the built `dist/` for
// dev-time hot reload directly from pixflow source.
export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      pixflow: resolve(__dirname, '../../packages/pixflow/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    open: false,
    fs: {
      allow: [resolve(__dirname, '../..')],
    },
  },
  optimizeDeps: {
    exclude: ['pixflow'],
  },
});
```

- [ ] **Step 8.3: Create examples/vanilla-js/package.json**

Create `examples/vanilla-js/package.json`:

```json
{
  "name": "@pixflow-examples/vanilla-js",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "pixflow": "workspace:*"
  },
  "devDependencies": {
    "@webgpu/types": "^0.1.52",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

The `workspace:*` protocol tells pnpm to link to the local `packages/pixflow` during development; on publish, pnpm rewrites this to the actual semver version (but this package is private so never published).

- [ ] **Step 8.4: Update tsconfig path mapping**

The current `examples/vanilla-js/tsconfig.json` has:

```json
"paths": {
  "pixflow": ["../../src/index.ts"]
}
```

Modify it to:

```json
"paths": {
  "pixflow": ["../../packages/pixflow/src/index.ts"]
}
```

Use the Edit tool to change that exact line.

- [ ] **Step 8.5: Verify the demo directory structure**

Run:
```bash
ls examples/vanilla-js/
```

Expected:
```
index.html
main.ts
package.json
style.css
tsconfig.json
vite.config.ts
zip.ts
```

---

## Task 9: Move landing to packages/landing

**Files:**
- Move: `landing/` → `packages/landing/`

- [ ] **Step 9.1: Move the landing directory**

Run:
```bash
git mv landing packages/landing
```

- [ ] **Step 9.2: Verify landing still has its files**

Run:
```bash
ls packages/landing/
```

Expected:
```
README.md
eslint.config.js
index.html
package.json
pnpm-lock.yaml
public
src
tsconfig.app.json
tsconfig.json
tsconfig.node.json
vite.config.ts
```

No internal landing paths need updating — everything is self-contained inside the `landing/` folder.

---

## Task 10: Update pnpm-workspace.yaml

**Files:**
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 10.1: Rewrite pnpm-workspace.yaml**

Overwrite `pnpm-workspace.yaml` with:

```yaml
packages:
  - 'packages/*'
  - 'examples/*'
```

This tells pnpm:
- Every subdirectory of `packages/` is a workspace member (pixflow, editor, editor-ml, landing)
- Every subdirectory of `examples/` is a workspace member (vanilla-js)

The root (`.`) is no longer a workspace member — it's just the workspace coordinator.

---

## Task 11: Create editor skeleton package

**Files:**
- Create: `packages/editor/package.json`

- [ ] **Step 11.1: Create the editor package.json**

Create `packages/editor/package.json`:

```json
{
  "name": "@pixflow/editor",
  "version": "0.0.0",
  "private": true,
  "description": "Pixflow editor application (skeleton — no implementation yet)",
  "type": "module",
  "scripts": {
    "typecheck": "echo 'editor skeleton has no code yet; skipping typecheck' && exit 0",
    "test": "echo 'editor skeleton has no tests yet; skipping' && exit 0",
    "build": "echo 'editor skeleton has no code yet; skipping build' && exit 0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**Why no-op scripts:** The root `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build` walks every workspace package. Packages missing these scripts cause pnpm to emit warnings. Explicit no-op scripts keep CI output clean until PR #2 adds real implementation.

---

## Task 12: Create editor-ml skeleton package

**Files:**
- Create: `packages/editor-ml/package.json`

- [ ] **Step 12.1: Create the editor-ml package.json**

Create `packages/editor-ml/package.json`:

```json
{
  "name": "@pixflow/editor-ml",
  "version": "0.0.0",
  "private": true,
  "description": "Pixflow editor ML modules (face detection; skeleton — no implementation yet)",
  "type": "module",
  "scripts": {
    "typecheck": "echo 'editor-ml skeleton has no code yet; skipping typecheck' && exit 0",
    "test": "echo 'editor-ml skeleton has no tests yet; skipping' && exit 0",
    "build": "echo 'editor-ml skeleton has no code yet; skipping build' && exit 0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

---

## Task 13: Clean install and verify everything works

**Files:** none (verification task)

- [ ] **Step 13.1: Remove old node_modules and re-install**

Run:
```bash
rm -rf node_modules packages/landing/node_modules
pnpm install
```

Expected: pnpm detects the new workspace layout, installs dependencies for every package, finishes with no errors. You may see `scope: pixflow-workspace` in the output — that confirms pnpm is using the new workspace config.

- [ ] **Step 13.2: Verify pixflow builds identically**

Run:
```bash
pnpm --filter pixflow build
ls -la packages/pixflow/dist/ > /tmp/pixflow-postmigration-dist.txt
diff /tmp/pixflow-baseline-dist.txt /tmp/pixflow-postmigration-dist.txt
```

Expected: `diff` produces no output (identical file listings, same entry files). Sizes may differ slightly in the `-map` files if tsup includes new relative path info — that's fine. If any ENTRY file (`index.js`, `index.cjs`, `index.d.ts`, `index.d.cts`) is missing or the set is different, the migration broke the build.

- [ ] **Step 13.3: Verify pixflow tests pass**

Run:
```bash
pnpm --filter pixflow test 2>&1 | tee /tmp/pixflow-postmigration-tests.log
```

Compare the tail of this log with `/tmp/pixflow-baseline-tests.log`:
- Same number of test files
- Same number of tests
- Same pass/fail count

Expected: all tests still pass.

- [ ] **Step 13.4: Verify pixflow typechecks**

Run:
```bash
pnpm --filter pixflow typecheck
```

Expected: clean (no errors). If the baseline had errors, they should NOT appear here because those errors were in `examples/vanilla-js/main.ts`, which is no longer part of pixflow's typecheck scope.

- [ ] **Step 13.5: Verify the demo still runs**

Start the dev server in the background:
```bash
pnpm --filter @pixflow-examples/vanilla-js dev &
DEV_PID=$!
sleep 5
curl -sSf http://localhost:5173/ -o /tmp/demo-index.html
head -5 /tmp/demo-index.html
kill $DEV_PID 2>/dev/null
```

Expected: the HTML output starts with `<!doctype html>` and includes the title `pixflow · WebGPU image pipelines in the browser`. If curl returns non-zero or the content is wrong, the demo did not start correctly.

- [ ] **Step 13.6: Verify the landing still runs**

Start the landing dev server in the background:
```bash
pnpm --filter landing dev --port 5174 &
LANDING_PID=$!
sleep 5
curl -sSf http://localhost:5174/ -o /tmp/landing-index.html
head -5 /tmp/landing-index.html
kill $LANDING_PID 2>/dev/null
```

Expected: HTML starts with `<!doctype html>` and contains landing content (hero section, "pixflow" brand).

- [ ] **Step 13.7: Verify workspace-wide recursive commands work**

Run:
```bash
pnpm -r typecheck
```

Expected: pixflow passes, editor/editor-ml skeletons print "skipping" messages and exit 0, examples/vanilla-js may fail with known pre-existing errors (`requestAdapterInfo`, `compare possibly null`) — those are NOT regressions from this PR.

---

## Task 14: Update root README with new structure note

**Files:**
- Modify: `README.md`

- [ ] **Step 14.1: Add a "Repository layout" section**

The current README has a "Develop locally" section with old commands. Find that section and update the commands to match the new workspace:

Before (approximate — your README may vary slightly):
```
pnpm install
pnpm dev          # demo at http://localhost:5173
pnpm --dir landing dev -- --port 5174   # landing page at http://localhost:5174
pnpm test         # headless unit tests
pnpm typecheck    # strict TS
pnpm build        # library bundle via tsup → dist/
```

After:
```
pnpm install
pnpm dev:demo                           # demo at http://localhost:5173
pnpm dev:landing                        # landing at http://localhost:5174
pnpm -r test                            # all package tests
pnpm -r typecheck                       # all package typechecks
pnpm --filter pixflow build             # library bundle → packages/pixflow/dist/
```

Use Read first to see the exact current content, then Edit to make the change precisely.

---

## Task 15: Commit the migration

**Files:** none (commit operation)

- [ ] **Step 15.1: Review the diff one last time**

Run:
```bash
git status --short
git diff --stat HEAD
```

Expected: many `R` (renamed) entries for moved files, a few `M` (modified) for `package.json` / `pnpm-workspace.yaml` / `README.md`, a few `A` (added) for the new skeleton package.json files.

- [ ] **Step 15.2: Stage everything**

Run:
```bash
git add -A
git status --short
```

Expected: status shows staged renames and additions, no unstaged modifications.

- [ ] **Step 15.3: Create the commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
refactor: migrate to pnpm monorepo layout (PR #1 of editor rollout)

Move pixflow library from repo root into packages/pixflow/ to prepare
for the editor application. Create empty skeleton packages for editor
and editor-ml. Move landing into packages/landing/ for uniform layout.
Convert examples/vanilla-js into a workspace package that depends on
pixflow via workspace:* protocol.

No functional changes to pixflow; build output, tests, and demo behavior
are unchanged. The examples/vanilla-js demo's TypeScript path mapping
and Vite alias have been updated to point at the new pixflow source
location.

Acceptance (verified in CI):
- pnpm --filter pixflow build produces identical dist/
- pnpm --filter pixflow test: all tests pass
- pnpm --filter @pixflow-examples/vanilla-js dev: demo runs
- pnpm --filter landing dev: landing runs
- Git history preserved via git mv (verifiable with git log --follow)

Refs: docs/superpowers/specs/2026-04-17-pixflow-editor-architecture-design.md
Next: PR #2 (editor package boot — minimal React shell importing pixflow)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 15.4: Verify the commit was created**

Run:
```bash
git log --oneline -3
```

Expected: the new migration commit at the top.

---

## Self-review checklist (run before opening PR)

Before submitting this PR for review, walk through these personally:

- [ ] `pnpm install` runs clean from scratch after `rm -rf node_modules`
- [ ] `pnpm --filter pixflow build` output matches pre-migration `dist/` (entry files identical)
- [ ] `pnpm --filter pixflow test` passes all tests
- [ ] `pnpm --filter pixflow typecheck` passes
- [ ] `pnpm --filter @pixflow-examples/vanilla-js dev` serves the demo at :5173
- [ ] `pnpm --filter landing dev` serves the landing (custom port if needed)
- [ ] `git log --follow packages/pixflow/src/pipeline/pipeline.ts` shows pre-migration history
- [ ] Root `package.json` has no runtime or pixflow-specific fields (no `main`, `exports`, `files`)
- [ ] `packages/editor/package.json` and `packages/editor-ml/package.json` exist with no-op scripts
- [ ] No files remain at the repo root that belong inside a package (no stray `src/`, `test/`, `*.config.*` except `.prettierrc`)
- [ ] README's dev commands match the new workspace structure

---

## Known risks and mitigations

- **Risk:** `pnpm install` fails because the existing `node_modules` has stale symlinks.
  **Mitigation:** Task 13.1 removes `node_modules` before re-installing.

- **Risk:** `git mv` fails if the destination directory doesn't exist.
  **Mitigation:** Task 3 explicitly creates `packages/{pixflow,editor,editor-ml}/` before any `git mv` runs.

- **Risk:** The demo dev server can't find `pixflow` after migration.
  **Mitigation:** Both the Vite alias (Task 8.2) and the tsconfig path mapping (Task 8.4) are updated. Task 13.5 verifies the demo actually serves.

- **Risk:** Landing has its own `node_modules` and `pnpm-lock.yaml` that shouldn't be mixed with the workspace.
  **Mitigation:** Task 13.1 removes `packages/landing/node_modules`. pnpm workspace install re-hydrates it correctly.

- **Risk:** The `@webgpu/types` dependency is needed by both pixflow and the demo.
  **Mitigation:** It's declared in both `packages/pixflow/package.json` and `examples/vanilla-js/package.json`. pnpm hoists it.

- **Risk:** CI may be pinned to `pnpm <script>` (root-level) commands that no longer exist.
  **Mitigation:** There is no CI config in this repo (only `.git/hooks` worth noting). Task 14 updates the README. If CI is added later (spec Phase 6), it uses the new commands directly.

---

## What PR #1 explicitly does NOT include

These belong to PR #2 or later — trying to include them here expands this PR beyond "skeleton":

- Any editor source code (React components, state, render pipeline)
- Any editor-ml source code (ONNX, face detection)
- `pnpm --filter pixflow/internal` export path (added in PR #2 when editor needs it)
- Any CI workflow file
- Any npm publishing configuration
- Tailwind / Radix / zustand setup (PR #2 or later)
- Fixing the known pre-existing TypeScript errors in `examples/vanilla-js/main.ts` (separate PR, if at all)
- Fixing the card-view clip-path direction issue identified earlier (separate PR)
