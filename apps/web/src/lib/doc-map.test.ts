/**
 * Ensures every doc link resolves, across every orienting document.
 *
 * The map rots silently otherwise — a renamed or deleted doc leaves a
 * broken pointer that future readers will dutifully try to follow. This
 * test used to cover only AGENTS.md and CLAUDE.md, which is exactly why
 * those two stayed accurate while README.md, CONTRIBUTING.md and
 * everything under docs/ drifted. See docs/ONBOARDING_AUDIT.md, Phase 8.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

function docsDirFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(dir, entry.name))
        : entry.name.endsWith('.md')
          ? [join(dir, entry.name)]
          : [],
    );
  return walk('docs');
}

const MAP_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'CONTRIBUTING.md',
  ...docsDirFiles(),
];

// Matches relative markdown links: [text](docs/foo.md) or [text](./foo.md).
// Skips absolute URLs (http, https, mailto) and pure anchors (#section).
const LINK_RE = /\[[^\]]+\]\((?!https?:|mailto:|#)([^)#?]+)(?:[?#][^)]*)?\)/g;

function extractLocalLinks(markdown: string): string[] {
  const links: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(markdown)) !== null) {
    links.push(m[1]);
  }
  return links;
}

describe('documentation map', () => {
  it('covers every orienting document', () => {
    // A doc added under docs/ is picked up automatically; the four at the
    // repo root are listed explicitly so deleting one fails loudly.
    expect(MAP_FILES).toEqual(expect.arrayContaining([
      'AGENTS.md',
      'CLAUDE.md',
      'README.md',
      'CONTRIBUTING.md',
    ]));
    expect(MAP_FILES.length).toBeGreaterThan(4);
  });

  for (const mapFile of MAP_FILES) {
    describe(mapFile, () => {
      const absMap = resolve(REPO_ROOT, mapFile);
      const exists = existsSync(absMap);

      it('exists', () => {
        expect(exists).toBe(true);
      });

      if (!exists) return;

      const contents = readFileSync(absMap, 'utf8');
      const links = extractLocalLinks(contents);

      if (links.length === 0) return;

      it.each(links.map((l) => [l]))(
        'links to an existing file: %s',
        (link) => {
          const target = resolve(dirname(absMap), link);
          expect({ link, exists: existsSync(target) }).toEqual({
            link,
            exists: true,
          });
        },
      );
    });
  }
});
