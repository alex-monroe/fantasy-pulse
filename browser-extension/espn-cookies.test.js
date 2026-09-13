import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  extractLeagueId,
  maskValue,
  normalizeEspnS2,
  normalizeSwid,
  pickCookie,
} from './espn-cookies.js';

test('pickCookie prefers the broad domain cookie over a stale host-only one', () => {
  const chosen = pickCookie([
    { domain: 'fantasy.espn.com', value: 'stale-host-only-value' },
    { domain: '.espn.com', value: 'live' },
  ]);
  assert.equal(chosen.value, 'live');
});

test('pickCookie falls back to the longest value within one domain', () => {
  const chosen = pickCookie([
    { domain: '.espn.com', value: 'short' },
    { domain: '.espn.com', value: 'a-much-longer-token' },
  ]);
  assert.equal(chosen.value, 'a-much-longer-token');
});

test('pickCookie ignores empty values and empty input', () => {
  assert.equal(pickCookie([{ domain: '.espn.com', value: '' }]), null);
  assert.equal(pickCookie([]), null);
  assert.equal(pickCookie(undefined), null);
});

test('normalizeSwid wraps a bare GUID in braces', () => {
  assert.equal(normalizeSwid('ABC-123'), '{ABC-123}');
});

test('normalizeSwid leaves an already-braced GUID with one pair of braces', () => {
  assert.equal(normalizeSwid('{ABC-123}'), '{ABC-123}');
});

test('normalizeSwid decodes a percent-encoded SWID', () => {
  assert.equal(normalizeSwid('%7BABC-123%7D'), '{ABC-123}');
});

test('normalizeSwid tolerates a malformed escape rather than throwing', () => {
  // `%2G` is not a valid escape, so decodeURIComponent throws and the raw
  // value is wrapped as-is rather than the popup blowing up.
  assert.equal(normalizeSwid('%7BABC-1%2G3%7D'), '{%7BABC-1%2G3%7D}');
});

test('normalizeSwid returns empty for empty input', () => {
  assert.equal(normalizeSwid(''), '');
  assert.equal(normalizeSwid('   '), '');
  assert.equal(normalizeSwid(undefined), '');
});

test('normalizeEspnS2 trims but never percent-decodes', () => {
  assert.equal(normalizeEspnS2('  AEB%2Bxyz%2F123  '), 'AEB%2Bxyz%2F123');
});

test('extractLeagueId reads the leagueId query param', () => {
  assert.equal(
    extractLeagueId('https://fantasy.espn.com/football/league?leagueId=123456'),
    '123456'
  );
});

test('extractLeagueId is case-insensitive on the param name', () => {
  assert.equal(
    extractLeagueId('https://fantasy.espn.com/football/team?LeagueID=42&teamId=1'),
    '42'
  );
});

test('extractLeagueId reads a hash-routed leagueId', () => {
  assert.equal(
    extractLeagueId('https://fantasy.espn.com/football/league#leagueId=777'),
    '777'
  );
});

test('extractLeagueId rejects non-espn hosts', () => {
  assert.equal(extractLeagueId('https://evil.example.com/?leagueId=1'), null);
  assert.equal(extractLeagueId('https://notespn.com/?leagueId=1'), null);
});

test('extractLeagueId rejects non-numeric and missing ids', () => {
  assert.equal(extractLeagueId('https://fantasy.espn.com/football/league?leagueId=abc'), null);
  assert.equal(extractLeagueId('https://fantasy.espn.com/football/league'), null);
  assert.equal(extractLeagueId('not a url'), null);
  assert.equal(extractLeagueId(undefined), null);
});

test('maskValue hides the middle of a long token but keeps its length', () => {
  const masked = maskValue('A'.repeat(40));
  assert.match(masked, /^AAAA•{8}AAAA \(40 chars\)$/);
});

test('maskValue fully hides a short value', () => {
  assert.equal(maskValue('abc'), '•••');
});
