import { render, screen } from '@testing-library/react'
import { PlayerCard, getGameStatusLabel, getGamePercentRemaining } from '@/components/player-card'
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

  it('shows the percentage remaining for a live game', () => {
    const livePlayer = {
      ...player,
      gameStatus: 'in_progress',
      gameQuarter: 'Q1',
      gameClock: '10:00',
    }

    render(<PlayerCard player={livePlayer} />)
    const expectedHeight = getGamePercentRemaining(livePlayer)
    expect(expectedHeight).not.toBeNull()

    const overlay = screen.getByTestId('game-progress-overlay')
    expect(overlay).toHaveStyle(`height: ${expectedHeight}%`)
  })

  it.each([
    {
      description: 'more than 25% remaining',
      gameQuarter: 'Q3' as const,
      gameClock: '10:00',
      expectedClass: 'bg-emerald-500/20',
    },
    {
      description: '25% or less remaining',
      gameQuarter: 'Q4' as const,
      gameClock: '15:00',
      expectedClass: 'bg-yellow-400/20',
    },
    {
      description: '10% or less remaining',
      gameQuarter: 'Q4' as const,
      gameClock: '6:00',
      expectedClass: 'bg-red-500/20',
    },
  ])('uses $description overlay color', ({ gameQuarter, gameClock, expectedClass }) => {
    const livePlayer = {
      ...player,
      gameStatus: 'in_progress' as const,
      gameQuarter,
      gameClock,
    }

    render(<PlayerCard player={livePlayer} />)
    const overlay = screen.getByTestId('game-progress-overlay')
    expect(overlay).toHaveClass(expectedClass)
  })
})

describe('getGamePercentRemaining', () => {
  const basePlayer: GroupedPlayer = {
    id: '1',
    name: 'Test Player',
    position: 'QB',
    realTeam: 'TB',
    score: 0,
    gameStatus: 'in_progress',
    gameStartTime: null,
    gameQuarter: 'Q2',
    gameClock: '12:30',
    onUserTeams: 0,
    onOpponentTeams: 0,
    gameDetails: {
      score: '',
      timeRemaining: '',
      fieldPosition: '',
    },
    imageUrl: '',
    onBench: false,
    matchupColors: [],
    count: 1,
  }

  it('calculates the remaining percentage for a valid in-progress game', () => {
    const result = getGamePercentRemaining(basePlayer)
    expect(result).not.toBeNull()
    expect(result as number).toBeCloseTo(70.8, 1)
  })

  it('returns null when the game is not in progress', () => {
    const result = getGamePercentRemaining({ ...basePlayer, gameStatus: 'final' })
    expect(result).toBeNull()
  })

  it('returns null when the quarter is missing', () => {
    const result = getGamePercentRemaining({ ...basePlayer, gameQuarter: null })
    expect(result).toBeNull()
  })
})
