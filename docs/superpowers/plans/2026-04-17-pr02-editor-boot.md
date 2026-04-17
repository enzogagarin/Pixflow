# PR #2 — Editor Package Boot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boot a minimal React shell for `@pixflow/editor` that loads, imports pixflow successfully, detects WebGPU, and renders a dark-themed "hello" screen. No editor state, no canvas, no inspector yet — just a working dev server + bundle that future PRs build on.

**Architecture:** React 19 + Vite 5 + TypeScript 5.6. Tailwind CSS v4 via `@tailwindcss/vite` plugin (zero-config CSS-first approach). The `App` component calls pixflow's `isWebGPUSupported()` once on mount and displays a status pill. All three dev servers (pixflow-examples, landing, editor) run on distinct ports: demo 5173, landing 5174, editor 5175.

**Tech Stack:** React 19, Vite 5, TypeScript 5.6, Tailwind CSS v4, pixflow (workspace dep).

**Spec reference:** `docs/superpowers/specs/2026-04-17-pixflow-editor-architecture-design.md` Sections 1 (package layout), 4 (design language / tech stack), 7 (migration PR #2 row).

**Acceptance criteria for this PR:**

1. `pnpm --filter @pixflow/editor dev` starts a Vite dev server on http://localhost:5175 serving HTML with the `<div id="root">` React mount point.
2. The rendered page shows "Pixflow Editor" heading, a WebGPU status pill (green ok / red unavailable), and a small "imported pixflow v0.1.0-prototype" footer.
3. Opening the page in a supported browser produces **zero console errors** (warnings from Vite dev HMR are tolerated).
4. `pnpm --filter @pixflow/editor build` produces a `dist/` with `index.html` + hashed JS/CSS assets (no errors).
5. `pnpm --filter @pixflow/editor typecheck` passes under strict TypeScript.
6. `pnpm -r test` on the whole monorepo still passes (editor has no tests yet; pixflow's 130 tests unaffected).
7. Existing demo and landing dev servers continue to work on their ports (5173, 5174).
8. No deps installed beyond what this PR actually uses (no zustand, immer, Radix, lucide — those land in later PRs with YAGNI discipline).

---

## File structure after this PR

```
packages/editor/
├── package.json                  ← MODIFIED: real scripts + deps
├── tsconfig.json                 ← NEW
├── vite.config.ts                ← NEW
├── index.html                    ← NEW
├── src/
│   ├── main.tsx                  ← NEW (React mount)
│   ├── App.tsx                   ← NEW (top-level component)
│   ├── components/
│   │   └── WebGPUStatus.tsx      ← NEW (status pill)
│   └── index.css                 ← NEW (Tailwind + base styles)
└── .gitignore                    ← NEW (dist/, node_modules/)
```

Root README gets a small update noting the editor dev command.

---

## Task 1: Create feature branch from clean main

**Files:** none (git operation)

- [ ] **Step 1.1: Verify on clean main**

Run:
```bash
git status --short
git branch --show-current
```

Expected: no modified files; branch is `main`.

If working tree is not clean, commit or stash before proceeding.

- [ ] **Step 1.2: Baseline checks on main**

Run:
```bash
pnpm --filter pixflow test 2>&1 | tail -4
pnpm --filter pixflow typecheck 2>&1 | tail -3
pnpm --filter pixflow build 2>&1 | tail -4
```

Expected: 18 files / 130 tests pass; typecheck clean; build emits dist files. If any fails, stop and fix before starting PR #2.

- [ ] **Step 1.3: Create feature branch**

Run:
```bash
git checkout -b feature/pr02-editor-boot
git branch --show-current
```

Expected output: `feature/pr02-editor-boot`

---

## Task 2: Install runtime + dev dependencies for the editor

**Files:**
- Modify: `packages/editor/package.json`

- [ ] **Step 2.1: Install React + Vite + TypeScript + Tailwind**

Run from the repo root:

```bash
pnpm --filter @pixflow/editor add react@^19.0.0 react-dom@^19.0.0
pnpm --filter @pixflow/editor add -D \
  @types/react@^19.0.0 \
  @types/react-dom@^19.0.0 \
  @vitejs/plugin-react@^4.3.0 \
  typescript@^5.6.0 \
  vite@^5.4.0 \
  tailwindcss@^4.0.0 \
  @tailwindcss/vite@^4.0.0
```

Expected: pnpm writes `packages/editor/package.json` with dependencies and devDependencies sections. Lockfile updates.

- [ ] **Step 2.2: Add pixflow as a workspace dependency**

Run:

```bash
pnpm --filter @pixflow/editor add pixflow@workspace:*
```

Expected: `"pixflow": "workspace:*"` appears under `"dependencies"` in `packages/editor/package.json`.

- [ ] **Step 2.3: Verify install**

Run:
```bash
cat packages/editor/package.json | grep -A 10 dependencies
```

Expected: `react`, `react-dom`, `pixflow` in dependencies; `vite`, `typescript`, `tailwindcss`, etc. in devDependencies.

---

## Task 3: Rewrite packages/editor/package.json with real scripts

**Files:**
- Modify: `packages/editor/package.json`

The installs in Task 2 preserved the skeleton scripts (`echo ... skipping`). We need to replace them with real Vite commands.

- [ ] **Step 3.1: Read current package.json**

Run:
```bash
cat packages/editor/package.json
```

Note the exact dependency versions pnpm resolved so we preserve them.

- [ ] **Step 3.2: Rewrite scripts section**

Use the Edit tool to replace the skeleton scripts block. The `scripts` field should look exactly like this (leave `name`, `version`, `private`, `type`, `dependencies`, `devDependencies` as pnpm set them):

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 5175",
    "typecheck": "tsc --noEmit",
    "test": "echo 'editor has no unit tests yet (PR #3+); skipping' && exit 0"
  },
```

The `test` script intentionally stays a no-op for this PR — tests are introduced in PR #3 when state logic lands. Keeping it as a no-op instead of removing it lets `pnpm -r test` keep walking every package without warnings.

- [ ] **Step 3.3: Also update description**

Change `"description"` from the skeleton value to:

```
"description": "Pixflow editor application — React shell (WIP, feature work in PR #3+)",
```

---

## Task 4: Create packages/editor/tsconfig.json

**Files:**
- Create: `packages/editor/tsconfig.json`

- [ ] **Step 4.1: Write tsconfig.json**

Create `packages/editor/tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["@webgpu/types", "vite/client"],

    "jsx": "react-jsx",

    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,

    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*", "vite.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4.2: Install @webgpu/types (used by tsconfig types list)**

Run:
```bash
pnpm --filter @pixflow/editor add -D @webgpu/types@^0.1.52
```

Expected: `@webgpu/types` added under devDependencies.

---

## Task 5: Create packages/editor/vite.config.ts

**Files:**
- Create: `packages/editor/vite.config.ts`

- [ ] **Step 5.1: Write vite.config.ts**

Create `packages/editor/vite.config.ts` with:

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The editor consumes pixflow from source (not built dist/) for fast HMR.
// The workspace dependency `"pixflow": "workspace:*"` keeps type resolution
// honest; the Vite alias below bypasses the built output at dev time so
// changes to pixflow source hot-reload into the editor immediately.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      pixflow: resolve(__dirname, '../../packages/pixflow/src/index.ts'),
    },
  },
  server: {
    port: 5175,
    strictPort: false,
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

`strictPort: false` lets Vite pick the next free port if 5175 is taken — less friction when the demo/landing are already running.

---

## Task 6: Create packages/editor/index.html

**Files:**
- Create: `packages/editor/index.html`

- [ ] **Step 6.1: Write index.html**

Create `packages/editor/index.html` with:

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pixflow Editor</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ctext y='14' font-size='14'%3E%E2%96%A4%3C/text%3E%3C/svg%3E" />
    <meta name="description" content="Private, client-side photo editor. No uploads, ever." />
  </head>
  <body class="bg-[#0b0d12] text-[#e8ecf3] antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

The inline SVG favicon is a temporary placeholder matching pixflow's `▤` brand glyph. A real favicon lands in PR #14 alongside the PWA manifest.

---

## Task 7: Create packages/editor/src/index.css

**Files:**
- Create: `packages/editor/src/index.css`

- [ ] **Step 7.1: Write index.css**

Create `packages/editor/src/index.css` with:

```css
@import "tailwindcss";

/* Design tokens. Reuse the palette pixflow's demo already established so
   the editor feels like part of the same product family. */
@theme {
  --color-bg: #0b0d12;
  --color-bg-elev: #11141c;
  --color-bg-elev-2: #161a24;
  --color-fg: #e8ecf3;
  --color-muted: #7e8aa3;
  --color-accent: #6cf0c2;
  --color-accent-dim: #1d3a30;
  --color-warn: #ffd166;
  --color-danger: #ff6b6b;
  --color-border: #1f2532;
  --color-border-strong: #2b3344;

  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI",
    Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas,
    monospace;
}

html,
body,
#root {
  height: 100%;
}

body {
  font-family: var(--font-sans);
  margin: 0;
}
```

Tailwind v4 reads design tokens directly from CSS via `@theme`; no JS config file needed.

---

## Task 8: Create packages/editor/src/main.tsx (React mount)

**Files:**
- Create: `packages/editor/src/main.tsx`

- [ ] **Step 8.1: Write main.tsx**

Create `packages/editor/src/main.tsx` with:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root mount point in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

---

## Task 9: Create packages/editor/src/components/WebGPUStatus.tsx

**Files:**
- Create: `packages/editor/src/components/WebGPUStatus.tsx`

This is the first small, focused component — isolating the status pill makes App.tsx readable and gives future PRs a ready-made pattern for other status indicators.

- [ ] **Step 9.1: Write WebGPUStatus.tsx**

Create `packages/editor/src/components/WebGPUStatus.tsx` with:

```typescript
import { useEffect, useState } from 'react';
import { isWebGPUSupported } from 'pixflow';

type Status =
  | { phase: 'probing' }
  | { phase: 'supported' }
  | { phase: 'unsupported' };

export function WebGPUStatus(): JSX.Element {
  const [status, setStatus] = useState<Status>({ phase: 'probing' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isWebGPUSupported();
      if (cancelled) return;
      setStatus({ phase: ok ? 'supported' : 'unsupported' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { label, dotClass, textClass } = describe(status);

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-1.5 font-[var(--font-mono)] text-xs"
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className={textClass}>{label}</span>
    </div>
  );
}

function describe(s: Status): { label: string; dotClass: string; textClass: string } {
  switch (s.phase) {
    case 'probing':
      return {
        label: 'Detecting WebGPU…',
        dotClass: 'bg-[var(--color-muted)]',
        textClass: 'text-[var(--color-muted)]',
      };
    case 'supported':
      return {
        label: 'WebGPU ready',
        dotClass: 'bg-[var(--color-accent)]',
        textClass: 'text-[var(--color-fg)]',
      };
    case 'unsupported':
      return {
        label: 'WebGPU unavailable',
        dotClass: 'bg-[var(--color-danger)]',
        textClass: 'text-[var(--color-danger)]',
      };
  }
}
```

The `cancelled` flag in the effect prevents a React 18/19 StrictMode double-mount from calling `setStatus` after unmount, which would produce a "setState on unmounted component" warning in the console. That warning is the tell-tale sign of a leaked async effect; guarding against it is the standard React pattern.

---

## Task 10: Create packages/editor/src/App.tsx

**Files:**
- Create: `packages/editor/src/App.tsx`

- [ ] **Step 10.1: Write App.tsx**

Create `packages/editor/src/App.tsx` with:

```typescript
import { WebGPUStatus } from './components/WebGPUStatus';
import pixflowPkg from 'pixflow/package.json';

export function App(): JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
      <header className="flex items-center gap-3">
        <span className="font-[var(--font-mono)] text-2xl leading-none text-[var(--color-accent)]">
          ▤
        </span>
        <h1 className="font-[var(--font-mono)] text-2xl font-bold tracking-tight">
          Pixflow Editor
        </h1>
        <span className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-[2px] font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
          pre-alpha
        </span>
      </header>

      <p className="max-w-md text-center text-sm text-[var(--color-muted)]">
        Private, client-side photo editor. Nothing uploads, ever. Feature work
        begins in PR #3 — this is the boot shell.
      </p>

      <WebGPUStatus />

      <footer className="mt-auto pt-8 font-[var(--font-mono)] text-[11px] text-[var(--color-muted)]">
        imported pixflow v{pixflowPkg.version}
      </footer>
    </main>
  );
}
```

- [ ] **Step 10.2: Enable JSON module resolution for pixflow/package.json**

The `import pixflowPkg from 'pixflow/package.json'` needs TypeScript to allow importing JSON modules. We already set `"resolveJsonModule": true` in Task 4's tsconfig. Verify by running:

```bash
pnpm --filter @pixflow/editor typecheck 2>&1 | tail -3
```

Expected: clean pass. If it errors with "Cannot find module 'pixflow/package.json'", check that `packages/pixflow/package.json` exists (it should from PR #1) and that `"resolveJsonModule": true` is in `packages/editor/tsconfig.json`.

---

## Task 11: Create packages/editor/.gitignore

**Files:**
- Create: `packages/editor/.gitignore`

- [ ] **Step 11.1: Write .gitignore**

Create `packages/editor/.gitignore` with:

```
node_modules
dist
.vite
.DS_Store
*.log
```

The root `.gitignore` already covers most of these, but package-local gitignores are the convention so contributors running Vite builds from within `packages/editor/` don't accidentally stage `dist/`.

---

## Task 12: First dev-server smoke test

**Files:** none (verification)

- [ ] **Step 12.1: Install deps from scratch**

Because we've added several new packages, do a clean install:

```bash
pnpm install 2>&1 | tail -5
```

Expected: "Done in …s". No missing-peer warnings for `react`/`tailwindcss` (which we installed explicitly).

- [ ] **Step 12.2: Run typecheck**

Run:
```bash
pnpm --filter @pixflow/editor typecheck 2>&1 | tail -3
```

Expected: clean pass.

- [ ] **Step 12.3: Start dev server in background**

```bash
pnpm --filter @pixflow/editor dev > /tmp/editor-dev.log 2>&1 &
sleep 5
```

- [ ] **Step 12.4: Verify HTTP 200 and HTML content**

Run:
```bash
curl -sS http://localhost:5175/ -o /tmp/editor-index.html -w "HTTP %{http_code}\n"
grep -q '<div id="root">' /tmp/editor-index.html && echo "mount point found"
grep -q 'Pixflow Editor' /tmp/editor-index.html && echo "title found"
```

Expected:
```
HTTP 200
mount point found
title found
```

- [ ] **Step 12.5: Verify main.tsx compiles and is served**

Run:
```bash
curl -sS http://localhost:5175/src/main.tsx -o /tmp/editor-main.tsx -w "HTTP %{http_code}\n"
head -3 /tmp/editor-main.tsx
```

Expected: HTTP 200. First three lines show the React imports. If you see an HTML error page instead, check Vite's log at `/tmp/editor-dev.log` for the underlying compile error.

- [ ] **Step 12.6: Kill the background dev server**

```bash
pkill -f "vite" 2>/dev/null
sleep 1
```

This stops every Vite instance (editor, demo, landing if running). Restart them individually with `pnpm --filter <pkg> dev` when needed.

---

## Task 13: Browser verification (manual)

**Files:** none (human verification)

- [ ] **Step 13.1: Start editor dev server**

```bash
pnpm --filter @pixflow/editor dev &
sleep 4
```

- [ ] **Step 13.2: Open http://localhost:5175/ in a supported browser**

Expected to see:
- Centered layout on dark background
- `▤ Pixflow Editor [pre-alpha]` header
- Description paragraph
- WebGPU status pill — initially "Detecting WebGPU…" (grey dot), then either green "WebGPU ready" or red "WebGPU unavailable"
- Footer: `imported pixflow v0.1.0-prototype`

- [ ] **Step 13.3: Verify zero console errors**

Open DevTools → Console. Expected: empty or only Vite HMR info messages. No red errors.

- [ ] **Step 13.4: Verify the demo and landing still work**

Stop the editor, then start demo and landing in separate terminals:

```bash
pkill -f "vite" 2>/dev/null; sleep 1
pnpm --filter @pixflow-examples/vanilla-js dev &
sleep 3
curl -sS http://localhost:5173/ -o /dev/null -w "Demo HTTP %{http_code}\n"
pkill -f "vite" 2>/dev/null; sleep 1
pnpm --filter landing dev &
sleep 3
curl -sS http://localhost:5173/ -o /dev/null -w "Landing HTTP %{http_code}\n"
pkill -f "vite" 2>/dev/null
```

Expected:
```
Demo HTTP 200
Landing HTTP 200
```

(Each starts on 5173 because only one is running at a time — that's the Vite default.)

---

## Task 14: Production build check

**Files:** none (verification)

- [ ] **Step 14.1: Run the production build**

Run:
```bash
pnpm --filter @pixflow/editor build 2>&1 | tail -15
```

Expected: Vite emits `dist/index.html`, hashed JS chunks, a hashed CSS file. No errors. Bundle size should be in the low hundreds of KB (React + Tailwind runtime + pixflow inlined).

- [ ] **Step 14.2: List dist contents**

Run:
```bash
ls -la packages/editor/dist/
ls -la packages/editor/dist/assets/
```

Expected: `index.html` at the package root, `assets/*.js` and `assets/*.css` with hash suffixes.

- [ ] **Step 14.3: Preview the built bundle**

```bash
pnpm --filter @pixflow/editor preview > /tmp/editor-preview.log 2>&1 &
sleep 4
curl -sS http://localhost:5175/ -o /tmp/editor-preview.html -w "Preview HTTP %{http_code}\n"
grep -q 'Pixflow Editor' /tmp/editor-preview.html && echo "built HTML served"
pkill -f "vite" 2>/dev/null
```

Expected:
```
Preview HTTP 200
built HTML served
```

---

## Task 15: Update root README with editor dev command

**Files:**
- Modify: `README.md`

- [ ] **Step 15.1: Read the current "Develop locally" section**

Use Read on `/Users/buraksahin/Desktop/pixflow-latest/README.md`, finding the section that starts with `## Develop locally`.

- [ ] **Step 15.2: Add the editor dev line**

Find this block (added in PR #1):

```
# demo (vanilla-js): http://localhost:5173
pnpm dev:demo

# landing page: http://localhost:5173 (run separately, not alongside the demo)
pnpm dev:landing
```

Replace it with:

```
# demo (vanilla-js): http://localhost:5173
pnpm dev:demo

# editor app: http://localhost:5175
pnpm dev:editor

# landing page: http://localhost:5173 (run alone, not alongside the demo)
pnpm dev:landing
```

- [ ] **Step 15.3: Update the layout summary**

Find this block:

```
packages/
  pixflow/          ← the library (published as "pixflow" on npm)
  landing/          ← marketing page
  editor/           ← upcoming editor app (skeleton)
  editor-ml/        ← upcoming ML modules (skeleton)
```

Change the `editor/` comment from "(skeleton)" to "(boot shell — feature work in PR #3+)":

```
packages/
  pixflow/          ← the library (published as "pixflow" on npm)
  landing/          ← marketing page
  editor/           ← editor app (boot shell — feature work in PR #3+)
  editor-ml/        ← upcoming ML modules (skeleton)
```

---

## Task 16: Add dev:editor script to root package.json

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 16.1: Add the new script**

Use the Edit tool to add a line to the root `package.json` `scripts` section. The current `scripts` block looks like:

```json
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
```

Replace it with:

```json
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "format": "prettier --write \"packages/*/src/**/*.{ts,tsx,html,css}\" \"examples/*/*.{ts,tsx,html,css}\"",
    "format:check": "prettier --check \"packages/*/src/**/*.{ts,tsx,html,css}\" \"examples/*/*.{ts,tsx,html,css}\"",
    "dev:demo": "pnpm --filter @pixflow-examples/vanilla-js dev",
    "dev:editor": "pnpm --filter @pixflow/editor dev",
    "dev:landing": "pnpm --filter landing dev"
  },
```

Verify:

```bash
grep '"dev:editor"' package.json
```

Expected: the line prints.

---

## Task 17: Full-workspace verification

**Files:** none (final sanity check)

- [ ] **Step 17.1: Recursive typecheck**

Run:
```bash
pnpm -r typecheck 2>&1 | tail -15
```

Expected: pixflow passes, editor passes, editor-ml skeleton prints "skipping" and exits 0, examples/vanilla-js shows the same **pre-existing** TS errors as before PR #2 (`requestAdapterInfo`, `compare possibly null` — not introduced by this PR).

- [ ] **Step 17.2: Recursive test**

Run:
```bash
pnpm -r test 2>&1 | tail -10
```

Expected: pixflow shows `18 files passed, 130 tests passed`; editor prints its "skipping" message and exits 0; editor-ml and landing similar.

- [ ] **Step 17.3: Recursive build**

Run:
```bash
pnpm -r build 2>&1 | tail -10
```

Expected: pixflow emits its dist, editor emits its dist, editor-ml skips, landing builds.

---

## Task 18: Commit + merge

**Files:** none (git operations)

- [ ] **Step 18.1: Review diff**

Run:
```bash
git status --short
git diff --stat HEAD
```

Expected: new files under `packages/editor/` (tsconfig, vite.config, index.html, src/*, .gitignore), modified `packages/editor/package.json`, modified `package.json`, modified `README.md`.

- [ ] **Step 18.2: Stage + commit**

Run:
```bash
git add packages/editor/ package.json README.md pnpm-lock.yaml 2>/dev/null
git status --short
git commit -m "$(cat <<'EOF'
feat(editor): boot minimal React shell (PR #2 of editor rollout)

Wire up @pixflow/editor as a Vite + React 19 + TypeScript + Tailwind v4
project. The shell renders a centered "Pixflow Editor" heading, a WebGPU
status pill (probing → ok/unavailable), and a version footer pulled from
pixflow's package.json. No state, no canvas, no inspector — those land in
PR #3+ once this boot shell is known-good.

Design tokens are declared once in index.css via Tailwind v4's @theme
directive (no tailwind.config.ts needed). The palette matches the demo's
existing dark theme so the product feels like one family.

Consumes pixflow via workspace:* protocol with a Vite alias pointing at
packages/pixflow/src/index.ts — edits to pixflow source hot-reload into
the editor during development.

Acceptance (verified locally):
- pnpm --filter @pixflow/editor dev: serves http://localhost:5175 with
  zero console errors
- pnpm --filter @pixflow/editor typecheck: clean under strict TS
- pnpm --filter @pixflow/editor build: emits hashed JS/CSS assets
- pnpm -r test: pixflow's 130 tests still pass
- Existing demo and landing dev servers unaffected

Refs: docs/superpowers/specs/2026-04-17-pixflow-editor-architecture-design.md
      docs/superpowers/plans/2026-04-17-pr02-editor-boot.md
Next: PR #3 (stateToPipeline adapter + unit tests)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 18.3: Merge to main**

Run:
```bash
git checkout main
git merge feature/pr02-editor-boot --no-ff -m "Merge 'feature/pr02-editor-boot' (PR #2)"
git branch -d feature/pr02-editor-boot
git log --oneline -4
```

Expected: `feature/pr02-editor-boot` merge commit at the top of `main`, followed by the feature commit, followed by the PR #1 + fix merge history.

---

## Self-review checklist (run before finishing)

- [ ] `pnpm --filter @pixflow/editor dev` serves the editor
- [ ] Browser shows the three elements: heading, status pill, version footer
- [ ] DevTools Console shows zero errors
- [ ] `pnpm --filter @pixflow/editor build` produces a non-empty dist/
- [ ] `pnpm --filter @pixflow/editor typecheck` passes clean
- [ ] `pnpm --filter pixflow test` still shows 130/130 passing
- [ ] The demo and landing still serve correctly
- [ ] No unused deps — check `packages/editor/package.json` has only the packages this PR uses (no zustand/immer/Radix/lucide yet)
- [ ] Root README `dev:editor` command added
- [ ] `git log --follow packages/pixflow/src/pipeline/pipeline.ts` still shows pre-migration history (PR #1 history preserved)

---

## What PR #2 explicitly does NOT include

These belong to PR #3 or later — including them in PR #2 would bundle too many concerns:

- Zustand store setup — PR #4
- immer integration — PR #4
- `EditState` type definition or `stateToPipeline` adapter — PR #3
- Canvas component — PR #5
- Compare slider overlay — PR #5
- Inspector sections (color, geometry, detail, overlay, export) — PR #6–#7
- Radix UI primitives — PR #6
- Lucide icons — PR #6
- PWA manifest + service worker — PR #14
- ML face detection — PR #9, #10
- `pixflow/internal` entry — added in PR #3 when editor first needs `TexturePool` / `acquireDevice`
- E2E or visual regression tests — PR #15
- Fixing the known pre-existing TS errors in `examples/vanilla-js/main.ts`

---

## Known risks and mitigations

- **Risk:** Tailwind v4 Vite plugin version drift — `@tailwindcss/vite@^4.0.0` is relatively new; a minor-version release could break the `@theme` syntax.
  **Mitigation:** Pin to the exact version pnpm resolves at install time if breakage occurs. Check release notes at upgrade.

- **Risk:** `import pixflowPkg from 'pixflow/package.json'` could fail under some TS moduleResolution modes.
  **Mitigation:** Task 4 explicitly sets `resolveJsonModule: true` and `moduleResolution: "Bundler"`, which combined handle this case. Task 10.2 verifies.

- **Risk:** React 19 StrictMode double-invokes effects in development; async effects without cleanup flags leak setState calls.
  **Mitigation:** `WebGPUStatus.tsx` uses a `cancelled` flag in the effect. This is the standard pattern and is documented inline.

- **Risk:** Vite dev server port collision if the demo is already running.
  **Mitigation:** Editor uses port 5175 (Task 5); `strictPort: false` falls back to the next free port if needed.

- **Risk:** pnpm install might report peer-dep warnings for React 19 + Tailwind v4 combinations.
  **Mitigation:** Peer-dep warnings are non-blocking; runtime behavior is verified by Task 12 + Task 13. Revisit if the editor actually fails to boot.
