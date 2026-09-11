import { render, screen } from '@testing-library/react';
import type { PlayerNewsDigest } from '@roster-loom/core';

import {
  NewsDigestEmptyState,
  PlayerNewsCard,
  formatNewsAge,
} from './components';

const NOW = Date.parse('2026-09-10T12:00:00.000Z');

const entry: PlayerNewsDigest = {
  playerKey: 'jonathan taylor',
  playerName: 'Jonathan Taylor',
  position: 'RB',
  nflTeam: 'IND',
  imageUrl: '',
  rosteredIn: [
    { teamName: 'Team A', leagueName: 'League One', starting: true },
    { teamName: 'Team B', leagueName: 'League Two', starting: false },
  ],
  opponentOnly: false,
  onOpponentTeams: 0,
  latestPublishedAt: '2026-09-10T10:00:00.000Z',
  items: [
    {
      guid: 'news-1',
      title: 'Jonathan Taylor - RB - IND: Practices fully Wednesday',
      headline: 'Practices fully Wednesday',
      link: 'https://example.com/taylor',
      summary: 'Taylor was a full participant.',
      publishedAt: '2026-09-10T10:00:00.000Z',
      author: 'RotoWire Staff',
      matchedBy: 'player',
    },
    {
      guid: 'news-2',
      title: 'Tyler Goodson - RB - IND: Starting Sunday',
      headline: 'Starting Sunday',
      link: null,
      summary: 'Goodson starts with Jonathan Taylor sidelined.',
      publishedAt: '2026-09-09T10:00:00.000Z',
      author: null,
      matchedBy: 'mention',
    },
  ],
};

describe('formatNewsAge', () => {
  it('renders minutes, hours and days', () => {
    expect(formatNewsAge('2026-09-10T11:45:00.000Z', NOW)).toBe('15m ago');
    expect(formatNewsAge('2026-09-10T08:00:00.000Z', NOW)).toBe('4h ago');
    expect(formatNewsAge('2026-09-08T12:00:00.000Z', NOW)).toBe('2d ago');
  });

  it('collapses the last minute to "just now"', () => {
    expect(formatNewsAge('2026-09-10T11:59:45.000Z', NOW)).toBe('just now');
  });

  it('returns null when there is no usable date', () => {
    expect(formatNewsAge(null, NOW)).toBeNull();
    expect(formatNewsAge('not a date', NOW)).toBeNull();
  });
});

describe('PlayerNewsCard', () => {
  it('shows the player, their news, and where they are rostered', () => {
    render(<PlayerNewsCard entry={entry} nowMs={NOW} />);

    expect(screen.getByRole('heading', { name: 'Jonathan Taylor' })).toBeInTheDocument();
    expect(screen.getByText('RB · IND')).toBeInTheDocument();
    expect(screen.getByText(/Starting in 1 of/)).toBeInTheDocument();
    expect(screen.getByText(/League One, League Two/)).toBeInTheDocument();
    expect(screen.getByText('Taylor was a full participant.')).toBeInTheDocument();
  });

  it('links a headline that has a URL and leaves one that does not as text', () => {
    render(<PlayerNewsCard entry={entry} nowMs={NOW} />);

    expect(screen.getByRole('link', { name: 'Practices fully Wednesday' })).toHaveAttribute(
      'href',
      'https://example.com/taylor',
    );
    expect(screen.queryByRole('link', { name: 'Starting Sunday' })).not.toBeInTheDocument();
    expect(screen.getByText('Starting Sunday')).toBeInTheDocument();
  });

  it('flags the weaker body-text matches', () => {
    render(<PlayerNewsCard entry={entry} nowMs={NOW} />);
    expect(screen.getAllByText('mentioned')).toHaveLength(1);
  });

  it('calls out a player who is only on an opponent roster', () => {
    render(
      <PlayerNewsCard
        entry={{ ...entry, rosteredIn: [], opponentOnly: true, onOpponentTeams: 2 }}
        nowMs={NOW}
      />,
    );

    expect(screen.getByText('On 2 opponents')).toBeInTheDocument();
  });

  it('falls back to initials when the roster carried no headshot', () => {
    const { container } = render(<PlayerNewsCard entry={entry} nowMs={NOW} />);
    expect(container.textContent).toContain('JT');
  });
});

describe('NewsDigestEmptyState', () => {
  it.each([
    ['no-teams' as const, 'No rosters connected yet'],
    ['no-news' as const, 'No news for your players'],
    ['error' as const, 'Could not load the news feed'],
  ])('explains the %s case', (reason, heading) => {
    render(<NewsDigestEmptyState reason={reason} />);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });
});
