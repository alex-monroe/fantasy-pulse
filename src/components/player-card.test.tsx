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
    count: 1,
    matchupColors: [],
    on_bench: false,
  }

  it('renders player information', () => {
    render(<PlayerCard player={player} />)
    expect(screen.getByText('Test Player')).toBeInTheDocument()
    expect(screen.getByText('QB - TB')).toBeInTheDocument()
    expect(screen.getByText('10.5')).toBeInTheDocument()
  })

  it('renders a benched player with a badge', () => {
    const benchedPlayer = { ...player, on_bench: true }
    render(<PlayerCard player={benchedPlayer} />)
    expect(screen.getByText('BN')).toBeInTheDocument()
  })
})
