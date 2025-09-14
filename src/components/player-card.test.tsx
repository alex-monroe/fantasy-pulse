import { render, screen } from '@testing-library/react'
import { PlayerCard } from '@/components/player-card'
import type { Player } from '@/lib/types'

describe('PlayerCard', () => {
  const player: Player = {
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
  }

  it('renders player information', () => {
    render(<PlayerCard player={player} />)
    expect(screen.getByText('Test Player')).toBeInTheDocument()
    expect(screen.getByText('QB - TB')).toBeInTheDocument()
    expect(screen.getByText('10.5')).toBeInTheDocument()
    expect(screen.queryByText('Possession')).not.toBeInTheDocument()
  })

  it('updates when liveScore changes', async () => {
    const { rerender } = render(<PlayerCard player={player} liveScore={10.5} />)

    expect(screen.getByText('10.5')).toBeInTheDocument()

    rerender(<PlayerCard player={player} liveScore={20.1} />)

    expect(await screen.findByText('20.1')).toBeInTheDocument()
  })
})
