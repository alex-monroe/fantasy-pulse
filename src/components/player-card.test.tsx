import { render, screen } from '@testing-library/react'
import { PlayerCard, getGameStatusLabel } from '@/components/player-card'
import type { GroupedPlayer, Team } from '@/lib/types'
import { MatchupPriorityProvider } from '@/hooks/use-matchup-priority'

describe('PlayerCard', () => {
  const player: GroupedPlayer = {
    id: '1',
    name: 'Test Player',
    position: 'QB',
    realTeam: 'TB',
    score: 10.5,
    gameStatus: 'possession',
    gameStartTime: null,
    gameQuarter: null,
    gameClock: null,
    onUserTeams: 1,
    onOpponentTeams: 0,
    gameDetails: {
      score: 'TB 0 - NO 0',
      timeRemaining: '10:00 Q1',
      fieldPosition: 'TB 20',
    },
    imageUrl: 'https://example.com/player.jpg',
    onBench: false,
    matchupColors: [{ color: '#000000', onBench: false }],
    matchups: [{ matchupId: 1, teamId: 1, score: 12.5, onBench: false }],
    count: 1,
  }

  const teams: Team[] = [{
    id: 1,
    name: 'Test Team',
    totalScore: 100,
    players: [],
    opponent: { name: 'Opponent', totalScore: 90, players: [] },
  }];

  const renderWithProvider = (player: GroupedPlayer) => {
    return render(
      <MatchupPriorityProvider initialTeams={teams}>
        <PlayerCard player={player} />
      </MatchupPriorityProvider>
    )
  }

  it('renders player information', () => {
    renderWithProvider(player)
    expect(screen.getByText('Test Player')).toBeInTheDocument()
    expect(screen.getByText('QB - TB')).toBeInTheDocument()
    expect(screen.getByText('12.5')).toBeInTheDocument()
  })

  it('renders a benched player with a badge', () => {
    const benchedPlayer = { ...player, onBench: true }
    renderWithProvider(benchedPlayer)
    expect(screen.getByText('BN')).toBeInTheDocument()
  })

  it('shows kickoff time for an upcoming game', () => {
    const upcomingPlayer = {
      ...player,
      gameStatus: 'pregame',
      gameStartTime: '2025-09-21T17:00:00Z',
    }

    renderWithProvider(upcomingPlayer)

    const expectedStatus = getGameStatusLabel(upcomingPlayer)
    expect(expectedStatus).not.toBeNull()
    expect(screen.getByText(expectedStatus as string)).toBeInTheDocument()
  })

  it('shows the quarter and clock for a live game', () => {
    const livePlayer = {
      ...player,
      gameStatus: 'in_progress',
      gameQuarter: 'Q3',
      gameClock: '4:12',
    }

    renderWithProvider(livePlayer)
    expect(screen.getByText('Q3 4:12')).toBeInTheDocument()
  })
})
