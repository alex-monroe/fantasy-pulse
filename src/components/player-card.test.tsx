import { render, screen } from '@testing-library/react'
import { PlayerCard } from '@/components/player-card'
import type { GroupedPlayer } from '@/lib/types'

describe('PlayerCard', () => {
  const player: GroupedPlayer = {
    id: '1',
    name: 'Test Player',
    position: 'QB',
    realTeam: 'TB',
    score: 10.5,
    gameStatus: 'possession',
    onUserTeams: 1,
    onOpponentTeams: 0,
    gameDetails: {
      score: 'TB 0 - NO 0',
      timeRemaining: '10:00 Q1',
      fieldPosition: 'TB 20',
    },
    imageUrl: 'https://example.com/player.jpg',
    on_bench: false,
    count: 1,
    matchupColors: ['#000000'],
    isDoubleAgent: false,
  }

  it('renders player information', () => {
    render(<PlayerCard player={player} />)
    expect(screen.getByText('Test Player')).toBeInTheDocument()
    expect(screen.getByText('QB - TB')).toBeInTheDocument()
    expect(screen.getByText('10.5')).toBeInTheDocument()
    expect(screen.queryByText('Possession')).not.toBeInTheDocument()
    expect(screen.queryByTestId('double-agent-badge')).not.toBeInTheDocument()
  })

  it('renders a double agent badge when the player is on user and opponent teams', () => {
    const doubleAgent: GroupedPlayer = {
      ...player,
      id: '2',
      name: 'Double Agent',
      onOpponentTeams: 2,
      isDoubleAgent: true,
    }

    render(<PlayerCard player={doubleAgent} />)

    expect(screen.getByText('Double Agent')).toBeInTheDocument()
    expect(screen.getByTestId('double-agent-badge')).toBeInTheDocument()
  })
})
