import { fireEvent, render, screen, within } from '@testing-library/react'
import { LeagueScoreboard } from '@/components/league-scoreboard'
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
): Team => ({
  id,
  name,
  league: { provider: 'demo', providerLeagueId: `l${id}`, name: `${name} League` },
  totalScore: score,
  players,
  opponent: { name: opponentName, totalScore: opponentScore, players: [] },
})

const renderScoreboard = (teams: Team[], onToggleCollapsed = jest.fn(), collapsed = false) => {
  const teamColors = new Map(teams.map((team, index) => [team.id, ['#f87171', '#60a5fa'][index % 2]]))
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
})
