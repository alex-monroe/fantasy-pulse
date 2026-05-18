/**
 * Ensures every doc referenced from AGENTS.md or CLAUDE.md actually exists.
 *
 * The map rots silently otherwise — a renamed or deleted doc leaves a
 * broken pointer that future agents will dutifully try to read. See
 * docs/CODE_ORGANIZATION.md for the rules behind this test.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

const MAP_FILES = ['AGENTS.md', 'CLAUDE.md'];

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
  for (const mapFile of MAP_FILES) {
    describe(mapFile, () => {
      const absMap = resolve(REPO_ROOT, mapFile);
      const exists = existsSync(absMap);

      it('exists at the repo root', () => {
        expect(exists).toBe(true);
      });

      if (!exists) return;

      const contents = readFileSync(absMap, 'utf8');
      const links = extractLocalLinks(contents);

      it('references at least one doc', () => {
        expect(links.length).toBeGreaterThan(0);
      });

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
