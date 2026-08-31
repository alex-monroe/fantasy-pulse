/**
 * Keeps the list of fantasy providers in sync across the three places it
 * is written down: the `integrations/` directory, the `FantasyProvider`
 * union, and the documentation.
 *
 * ESPN shipped as a complete fourth provider — actions, page, tests, a
 * README, a migration — and appeared in none of the orienting documents
 * for months, because every one of them hand-typed "Sleeper, Yahoo and
 * Ottoneu". Derive the list instead of repeating it. See
 * docs/ONBOARDING_AUDIT.md, Phase 8.
 */
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

/** Providers that have a folder under `integrations/`. */
const providerDirs = readdirSync(
  resolve(REPO_ROOT, 'apps/web/src/app/integrations'),
  { withFileTypes: true },
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** Providers named in the `FantasyProvider` union in packages/core. */
function unionMembers(): string[] {
  const types = readFileSync(
    resolve(REPO_ROOT, 'packages/core/src/types.ts'),
    'utf8',
  );
  const match = types.match(/export type FantasyProvider =([^;]+);/);
  if (!match) throw new Error('FantasyProvider union not found in types.ts');
  return Array.from(match[1].matchAll(/'([a-z]+)'/g))
    .map((m) => m[1])
    .sort();
}

describe('fantasy providers', () => {
  it('has at least the four shipped providers', () => {
    expect(providerDirs).toEqual(
      expect.arrayContaining(['espn', 'ottoneu', 'sleeper', 'yahoo']),
    );
  });

  it('matches the FantasyProvider union', () => {
    // `demo` is a synthetic provider used by demo mode; it has no folder.
    const fromUnion = unionMembers().filter((p) => p !== 'demo');
    expect(fromUnion).toEqual(providerDirs);
  });

  describe.each(providerDirs.map((p) => [p]))('%s', (provider) => {
    const dir = resolve(
      REPO_ROOT,
      'apps/web/src/app/integrations',
      provider,
    );
    const files = readdirSync(dir);

    // The pattern documented in docs/adding-integrations.md. *.example.json
    // is deliberately not required — only two providers have a payload
    // worth capturing.
    it.each([
      ['actions.ts'],
      ['actions.test.ts'],
      ['build-teams.ts'],
      ['page.tsx'],
      ['README.md'],
    ])('has %s', (file) => {
      expect({ provider, file, present: files.includes(file) }).toEqual({
        provider,
        file,
        present: true,
      });
    });

    it.each([
      ['README.md'],
      ['docs/ARCHITECTURE.md'],
      ['docs/CODE_ORGANIZATION.md'],
      ['docs/adding-integrations.md'],
    ])('is named in %s', (doc) => {
      const contents = readFileSync(resolve(REPO_ROOT, doc), 'utf8');
      expect({ provider, doc, named: contents.toLowerCase().includes(provider) })
        .toEqual({ provider, doc, named: true });
    });
  });
});
