import { renderHook, waitFor } from '@testing-library/react'
import { useIsMobile } from '@/hooks/use-mobile'

describe('useIsMobile', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        onchange: null,
        dispatchEvent: jest.fn(),
      })),
    })
  })

  it('returns true for mobile widths', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 })
    const { result } = renderHook(() => useIsMobile())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false for desktop widths', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1000 })
    const { result } = renderHook(() => useIsMobile())
    await waitFor(() => expect(result.current).toBe(false))
  })
})
