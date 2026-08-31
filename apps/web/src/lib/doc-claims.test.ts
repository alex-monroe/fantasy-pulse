/**
 * Checks the factual claims documentation makes about the repository:
 * every backticked file path resolves, and every `npm run <script>` it
 * tells you to run exists.
 *
 * This is the generalisation of doc-map.test.ts. That one guards links;
 * this one guards the claims in prose, which is where most of the drift
 * found in docs/ONBOARDING_AUDIT.md actually lived — a documented
 * `database.types.ts` that was never committed, a `.env.example` in the
 * wrong directory, a `setup.sh` nothing called, an `src/ai/` described as
 * "generative AI helpers".
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

function markdownFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(dir, entry.name))
        : entry.name.endsWith('.md')
          ? [join(dir, entry.name)]
          : [],
    );
  return [
    'AGENTS.md',
    'CLAUDE.md',
    'README.md',
    'CONTRIBUTING.md',
    ...walk('docs'),
    // A point-in-time audit deliberately names files that have since been
    // removed. It is a record of what was true on a date, not a live
    // description of the tree, so its claims are not checked.
  ].filter((f) => f !== join('docs', 'ONBOARDING_AUDIT.md'));
}

const DOCS = markdownFiles();

/**
 * A backticked token counts as a path claim when it is rooted at a real
 * top-level directory of this repo. A bare filename (`actions.ts`) is
 * prose about a convention, not a claim about one file, so it is skipped;
 * only a rooted path (`apps/web/src/app/actions.ts`) makes a checkable
 * claim.
 */
const PATH_LIKE = /^[\w.@/-]+$/;
const ROOTS = [
  'apps/',
  'packages/',
  'docs/',
  'supabase/',
  '.github/',
  '.claude/',
  'e2e/',
  'src/',
];

/** Paths that are correctly absent: gitignored, or created at runtime. */
const EXPECTED_ABSENT = new Set([
  '.mcp.json',
  '.claude/settings.local.json',
  'apps/web/.env.local',
  'apps/mobile/.env.local',
  'apps/web/public/sw.js',
  'apps/web/src/lib/database.types.ts',
]);

function pathClaims(markdown: string): string[] {
  const claims = new Set<string>();
  for (const [, token] of markdown.matchAll(/`([^`\n]+)`/g)) {
    const t = token.trim().replace(/\/$/, '');
    if (!PATH_LIKE.test(t)) continue;
    if (t.includes('<') || t.includes('*') || t.startsWith('@')) continue;
    if (t.includes('...')) continue;
    if (!ROOTS.some((root) => t.startsWith(root))) continue;
    if (EXPECTED_ABSENT.has(t)) continue;
    claims.add(t);
  }
  return Array.from(claims);
}

function scriptClaims(markdown: string): string[] {
  return Array.from(
    new Set(
      Array.from(markdown.matchAll(/npm run ([a-z][\w:-]*)/g)).map((m) => m[1]),
    ),
  );
}

function allScripts(): Set<string> {
  const names = new Set<string>();
  for (const pkg of [
    'package.json',
    'apps/web/package.json',
    'apps/mobile/package.json',
    'packages/core/package.json',
  ]) {
    const file = resolve(REPO_ROOT, pkg);
    if (!existsSync(file)) continue;
    const scripts = JSON.parse(readFileSync(file, 'utf8')).scripts ?? {};
    Object.keys(scripts).forEach((s) => names.add(s));
  }
  return names;
}

const SCRIPTS = allScripts();

describe('documentation claims', () => {
  for (const doc of DOCS) {
    const contents = readFileSync(resolve(REPO_ROOT, doc), 'utf8');

    const paths = pathClaims(contents);
    if (paths.length > 0) {
      describe(`${doc} — paths`, () => {
        it.each(paths.map((p) => [p]))('%s exists', (claimed) => {
          // Paths are written relative to the repo root everywhere except
          // inside docs/, where a sibling reference is also valid.
          const candidates = [
            resolve(REPO_ROOT, claimed),
            resolve(REPO_ROOT, 'docs', claimed),
            resolve(REPO_ROOT, 'apps/web', claimed),
          ];
          expect({
            path: claimed,
            exists: candidates.some((c) => existsSync(c)),
          }).toEqual({ path: claimed, exists: true });
        });
      });
    }

    const scripts = scriptClaims(contents);
    if (scripts.length > 0) {
      describe(`${doc} — npm scripts`, () => {
        it.each(scripts.map((s) => [s]))('npm run %s is defined', (script) => {
          expect({ script, defined: SCRIPTS.has(script) }).toEqual({
            script,
            defined: true,
          });
        });
      });
    }
  }
});
