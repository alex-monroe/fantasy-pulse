import { render, screen, fireEvent } from '@testing-library/react'
import { IntegrationStatus } from '@/components/integration-status'

const toastMock = jest.fn()

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

describe('IntegrationStatus', () => {
  beforeEach(() => {
    toastMock.mockClear()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('renders integrations and alerts', () => {
    render(<IntegrationStatus />)
    expect(screen.getByText('Platform Status')).toBeInTheDocument()
    expect(screen.getByText('ESPN')).toBeInTheDocument()
    expect(screen.getByText('Yahoo Sports')).toBeInTheDocument()
    expect(screen.getByText('Sleeper')).toBeInTheDocument()
    expect(screen.getByText('Alert Log')).toBeInTheDocument()
    expect(screen.getByText('Successfully synced with ESPN.')).toBeInTheDocument()
    expect(screen.getByText('Live scoring data is now active.')).toBeInTheDocument()
  })

  it('calls toast when syncing', () => {
    render(<IntegrationStatus />)
    fireEvent.click(screen.getByRole('button', { name: /sync all/i }))
    expect(toastMock).toHaveBeenCalledTimes(1)
    jest.runAllTimers()
    expect(toastMock).toHaveBeenCalledTimes(2)
  })
})
