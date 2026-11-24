import { render, screen } from '@testing-library/react';

import { LeagueList, LeagueScoringDetail, scoringSummary } from './components';

describe('LeagueScoringDetail', () => {
  it('shows provider-read settings grouped, with unmapped rules', () => {
    render(
      <LeagueScoringDetail
        provider="yahoo"
        leagueId="461.l.1"
        scoring={{
          source: 'provider',
          settings: { pass_td: 4, rec: 0.5, fgm_40_49: 4 },
          unmapped: [{ label: 'Return Touchdowns', value: 6 }],
        }}
      />
    );
    expect(screen.getByText('Read from Yahoo')).toBeInTheDocument();
    expect(screen.getAllByTestId('scoring-row')).toHaveLength(3);
    expect(screen.getByText('Passing TD')).toBeInTheDocument();
    expect(screen.getByText('Return Touchdowns')).toBeInTheDocument();
  });

  it('explains an inference and what it assumed', () => {
    render(
      <LeagueScoringDetail
        provider="espn"
        leagueId="99"
        scoring={{
          source: 'inferred',
          settings: { rec: 1 },
          unmapped: [],
          readError: 'ESPN rejected the stored credentials.',
          inference: { sampleSize: 120, matchRate: 0.96, throughWeek: 9, assumed: ['400+ yd passing game'] },
        }}
      />
    );
    expect(screen.getByText('Inferred · 96% match')).toBeInTheDocument();
    expect(screen.getByText(/120 player-weeks through week 9/)).toBeInTheDocument();
    expect(screen.getByText(/close enough to score live plays/)).toBeInTheDocument();
    expect(screen.getByText(/400\+ yd passing game/)).toBeInTheDocument();
  });

  it('says plainly when nothing is known yet', () => {
    render(<LeagueScoringDetail provider="ottoneu" leagueId="1" scoring={{ source: 'unknown', settings: {}, unmapped: [] }} />);
    expect(screen.getByText('No scoring known')).toBeInTheDocument();
    expect(screen.getByText(/stock half-PPR profile/)).toBeInTheDocument();
    expect(screen.queryAllByTestId('scoring-row')).toHaveLength(0);
  });
});

describe('LeagueList', () => {
  it('links each league to its page', () => {
    render(
      <LeagueList
        leagues={[
          {
            provider: 'yahoo',
            leagueId: '461.l.1',
            name: 'Work League',
            teamName: 'Mine',
            scoring: { source: 'provider', settings: { rec: 1, pass_td: 6, bonus_rec_te: 0.5 }, unmapped: [] },
          },
        ]}
      />
    );
    expect(screen.getByTestId('league-card')).toHaveAttribute('href', '/leagues/yahoo/461.l.1');
    expect(screen.getByText('PPR · 6-pt passing TDs · +0.5 TE premium')).toBeInTheDocument();
  });

  it('summarises unknown scoring', () => {
    expect(scoringSummary({ source: 'unknown', settings: {}, unmapped: [] })).toMatch(/stock half-PPR/);
  });
});
