import { fireEvent, render, screen, within } from '@testing-library/react'
import { LeagueScoreboard } from '@/components/league-scoreboard'
import { getTeamKey } from '@roster-loom/core'
import type { Player, Team } from '@roster-loom/core'

const makePlayer = (overrides: Partial<Player> & Pick<Player, 'name'>): Player => ({
  id: overrides.name,
  position: 'WR',
  realTeam: 'KC',
  score: 0,
  gameStatus: 'pregame',
  gameStartTime: null,
  gameQuarter: null,
  gameClock: null,
  onUserTeams: 1,
  onOpponentTeams: 0,
  gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
  imageUrl: '',
  onBench: false,
  ...overrides,
})

const makeTeam = (
  id: number,
  name: string,
  score: number,
  opponentName: string,
  opponentScore: number,
  players: Player[] = [],
  opponentPlayers: Player[] = [],
): Team => ({
  id,
  name,
  league: { provider: 'demo', providerLeagueId: `l${id}`, name: `${name} League` },
  totalScore: score,
  players,
  opponent: { name: opponentName, totalScore: opponentScore, players: opponentPlayers },
})

const renderScoreboard = (teams: Team[], onToggleCollapsed = jest.fn(), collapsed = false) => {
  const teamColors = new Map(
    teams.map((team, index) => [getTeamKey(team, index), ['#f87171', '#60a5fa'][index % 2]]),
  )
  return {
    onToggleCollapsed,
    ...render(
      <LeagueScoreboard
        teams={teams}
        teamColors={teamColors}
        changedScoreKeys={new Set()}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />,
    ),
  }
}

describe('LeagueScoreboard', () => {
  it('renders a tile per league with both scores and the differential', () => {
    renderScoreboard([makeTeam(1, 'My Squad', 124.5, 'Their Squad', 111.2)])

    expect(screen.getByText('My Squad League')).toBeInTheDocument()
    expect(screen.getByText('My Squad')).toBeInTheDocument()
    expect(screen.getByText('Their Squad')).toBeInTheDocument()
    expect(screen.getByText('124.5')).toBeInTheDocument()
    expect(screen.getByText('111.2')).toBeInTheDocument()
    expect(screen.getByText('+13.3')).toBeInTheDocument()
  })

  it('exposes the test ids the e2e suite addresses tiles by', () => {
    // apps/web/e2e/main-page.spec.ts locates each league's scores through
    // these ids; a rename here has to be made there too.
    renderScoreboard([makeTeam(1, 'My Squad', 124.5, 'Their Squad', 111.2)])

    const tile = screen.getByTestId('matchup-tile')
    expect(within(tile).getByTestId('matchup-team-score')).toHaveTextContent('124.5')
    expect(within(tile).getByTestId('matchup-opponent-score')).toHaveTextContent('111.2')
  })

  it('marks a trailing matchup with a negative differential', () => {
    renderScoreboard([makeTeam(1, 'My Squad', 80, 'Their Squad', 95.5)])
    expect(screen.getByText('−15.5')).toBeInTheDocument()
  })

  it('summarizes the week record across leagues', () => {
    renderScoreboard([
      makeTeam(1, 'Winning', 100, 'Opp', 50),
      makeTeam(2, 'Also winning', 90, 'Opp', 40),
      makeTeam(3, 'Losing', 10, 'Opp', 60),
    ])

    const record = screen.getByLabelText('League matchups').querySelector('span.rounded') as HTMLElement
    expect(record.textContent).toBe('2–1')
  })

  it('reports live and yet-to-play starters, deduplicated across leagues', () => {
    const live = makePlayer({ name: 'Josh Allen', realTeam: 'BUF', gameStatus: 'in_progress' })
    const later = makePlayer({ name: 'Night Gamer', realTeam: 'LV', gameStatus: 'pregame' })

    renderScoreboard([
      makeTeam(1, 'A', 10, 'OppA', 5, [live, later]),
      makeTeam(2, 'B', 10, 'OppB', 5, [live]),
    ])

    // Josh Allen starts in both leagues but is one live player, not two.
    expect(screen.getByText('1 player live')).toBeInTheDocument()
    expect(screen.getByText(/1 yet to play/)).toBeInTheDocument()
  })

  it('says so when every game in a matchup is over', () => {
    renderScoreboard([
      makeTeam(1, 'A', 10, 'OppA', 5, [
        makePlayer({ name: 'Done', gameStatus: 'final' }),
      ]),
    ])

    expect(screen.getByText('All games final')).toBeInTheDocument()
  })

  it('hides the tiles when collapsed and reports it through the toggle', () => {
    const { onToggleCollapsed } = renderScoreboard(
      [makeTeam(1, 'My Squad', 124.5, 'Their Squad', 111.2)],
      jest.fn(),
      true,
    )

    expect(screen.queryByText('My Squad League')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /show/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
  })

  it('renders nothing without any teams', () => {
    const { container } = renderScoreboard([])
    expect(container).toBeEmptyDOMElement()
  })

  describe('projections', () => {
    const projected = (name: string, projectedPoints: number, overrides: Partial<Player> = {}) =>
      makePlayer({ name, projectedPoints, ...overrides })

    it('shows a projected final for both sides of the matchup', () => {
      renderScoreboard([
        makeTeam(
          1,
          'My Squad',
          80,
          'Their Squad',
          70,
          [projected('Mine', 20)],
          [projected('Theirs', 15)],
        ),
      ])

      const tile = screen.getByTestId('matchup-tile')
      expect(within(tile).getByTestId('matchup-team-projection')).toHaveTextContent('100.0')
      expect(within(tile).getByTestId('matchup-opponent-projection')).toHaveTextContent('85.0')
      // The live scores stay put alongside them.
      expect(within(tile).getByTestId('matchup-team-score')).toHaveTextContent('80.0')
      expect(within(tile).getByTestId('matchup-opponent-score')).toHaveTextContent('70.0')
    })

    it('reads out a win probability for the projected leader', () => {
      renderScoreboard([
        makeTeam(
          1,
          'My Squad',
          80,
          'Their Squad',
          70,
          [projected('Mine', 20)],
          [projected('Theirs', 15)],
        ),
      ])

      const winProbability = screen.getByTestId('matchup-win-probability')
      expect(winProbability.textContent).toMatch(/^(\d{1,3}%|>99%|<1%)$/)
      expect(Number.parseInt(winProbability.textContent ?? '', 10)).toBeGreaterThan(50)
    })

    it('calls a decided matchup 100%', () => {
      renderScoreboard([
        makeTeam(
          1,
          'My Squad',
          120,
          'Their Squad',
          90,
          [projected('Mine', 20, { gameStatus: 'final' })],
          [projected('Theirs', 15, { gameStatus: 'final' })],
        ),
      ])

      expect(screen.getByTestId('matchup-win-probability')).toHaveTextContent('100%')
    })

    it('leaves the projection off entirely when there is none to show', () => {
      renderScoreboard([makeTeam(1, 'My Squad', 124.5, 'Their Squad', 111.2)])

      expect(screen.queryByTestId('matchup-team-projection')).not.toBeInTheDocument()
      expect(screen.queryByTestId('matchup-win-probability')).not.toBeInTheDocument()
      expect(screen.queryByTestId('week-projected-record')).not.toBeInTheDocument()
    })

    it('flags starters whose points are missing from the projection', () => {
      renderScoreboard([
        makeTeam(
          1,
          'My Squad',
          80,
          'Their Squad',
          70,
          [projected('Mine', 20), makePlayer({ name: 'Unknown' })],
          [projected('Theirs', 15)],
        ),
      ])

      expect(screen.getByText(/1 unprojected/)).toBeInTheDocument()
    })

    it('summarizes the projected record and expected wins for the week', () => {
      renderScoreboard([
        makeTeam(1, 'Ahead', 80, 'Opp', 50, [projected('A', 20)], [projected('B', 5)]),
        makeTeam(2, 'Behind', 40, 'Opp', 80, [projected('C', 5)], [projected('D', 20)]),
      ])

      const record = screen.getByTestId('week-projected-record')
      expect(record).toHaveTextContent('Proj 1–1')
      expect(record).toHaveTextContent(/exp wins/)
    })
  })
})
