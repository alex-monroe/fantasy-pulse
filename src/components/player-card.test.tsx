import { render, screen } from '@testing-library/react'
import { PlayerCard } from '@/components/player-card'
import type { Player } from '@/lib/types'

describe('PlayerCard', () => {
  const player: Player = {
    id: 1,
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

  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('renders player information', () => {
    render(<PlayerCard player={player} />)
    expect(screen.getByText('Test Player')).toBeInTheDocument()
    expect(screen.getByText('QB - TB')).toBeInTheDocument()
    expect(screen.getByText('10.5')).toBeInTheDocument()
    expect(screen.getByText('Possession')).toBeInTheDocument()
  })

  it('does not render a chip for pregame status', () => {
    const pregamePlayer: Player = { ...player, gameStatus: 'pregame' }
    render(<PlayerCard player={pregamePlayer} />)
    expect(screen.queryByText('Pregame')).not.toBeInTheDocument()
  })
})
