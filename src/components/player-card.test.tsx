import { render, screen } from '@testing-library/react'
import { PlayerCard, getGameStatusLabel } from '@/components/player-card'
import type { GroupedPlayer } from '@/lib/types'

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
    count: 1,
  }

  it('renders player information', () => {
    render(<PlayerCard player={player} />)
    expect(screen.getByText('Test Player')).toBeInTheDocument()
    expect(screen.getByText('QB - TB')).toBeInTheDocument()
    expect(screen.getByText('10.5')).toBeInTheDocument()
  })

  it('renders a benched player with a badge', () => {
    const benchedPlayer = { ...player, onBench: true }
    render(<PlayerCard player={benchedPlayer} />)
    expect(screen.getByText('BN')).toBeInTheDocument()
  })

  it('shows kickoff time for an upcoming game', () => {
    const upcomingPlayer = {
      ...player,
      gameStatus: 'pregame',
      gameStartTime: '2025-09-21T17:00:00Z',
    }

    render(<PlayerCard player={upcomingPlayer} />)

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

    render(<PlayerCard player={livePlayer} />)
    expect(screen.getByText('Q3 4:12')).toBeInTheDocument()
  })
})
