import { fireEvent, render, screen, within } from '@testing-library/react'
import { PlayerBoard } from '@/components/player-board'
import type { GroupedPlayer } from '@roster-loom/core'

const makePlayer = (
  overrides: Partial<GroupedPlayer> & Pick<GroupedPlayer, 'name'>,
): GroupedPlayer => ({
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
  imageUrl: 'https://example.com/p.jpg',
  onBench: false,
  matchupColors: [{ color: '#f87171', onBench: false }],
  count: 1,
  ...overrides,
})

const renderBoard = (players: GroupedPlayer[]) =>
  render(
    <PlayerBoard
      title="My players"
      players={players}
      width="wide"
      keyPrefix="test"
      isPlayerScoreChanged={() => false}
    />,
  )

describe('PlayerBoard', () => {
  it('groups starters into position bands', () => {
    renderBoard([
      makePlayer({ name: 'Quarterback', position: 'QB', score: 12 }),
      makePlayer({ name: 'Receiver', position: 'WR', score: 8 }),
      makePlayer({ name: 'Kicker', position: 'K', score: 3 }),
    ])

    expect(screen.getByRole('heading', { name: 'QB' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'WR' })).toBeInTheDocument()
    // Anything outside QB/RB/WR/TE lands in the Other band.
    expect(screen.getByRole('heading', { name: 'Other' })).toBeInTheDocument()
    // Positions with nobody in them are not rendered at all.
    expect(screen.queryByRole('heading', { name: 'TE' })).not.toBeInTheDocument()
  })

  it('sorts a band by score, highest first', () => {
    renderBoard([
      makePlayer({ name: 'Low', position: 'WR', score: 4 }),
      makePlayer({ name: 'High', position: 'WR', score: 21 }),
      makePlayer({ name: 'Mid', position: 'WR', score: 11 }),
    ])

    const names = screen.getAllByText(/^(Low|Mid|High)$/).map((node) => node.textContent)
    expect(names).toEqual(['High', 'Mid', 'Low'])
  })

  it('shows the starter count and starter total in the header', () => {
    const { container } = renderBoard([
      makePlayer({ name: 'Starter A', score: 10.5 }),
      makePlayer({ name: 'Starter B', score: 4.5 }),
      makePlayer({ name: 'Benched', score: 30, onBench: true }),
    ])

    const header = container.querySelector('h2')?.parentElement as HTMLElement
    // Bench points never count toward the board total.
    expect(within(header).getByText('15.0')).toBeInTheDocument()
    expect(within(header).getByText('2')).toBeInTheDocument()
  })

  it('keeps the bench collapsed until it is asked for', () => {
    renderBoard([
      makePlayer({ name: 'Starter', score: 10 }),
      makePlayer({ name: 'Benched', score: 3, onBench: true }),
    ])

    const toggle = screen.getByRole('button', { name: /bench/i })
    expect(screen.queryByText('Benched')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)

    expect(screen.getByText('Benched')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders an empty message when there is nobody to show', () => {
    renderBoard([])
    expect(screen.getByText('No players to show.')).toBeInTheDocument()
  })
})
