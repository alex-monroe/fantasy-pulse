import { cn } from '@/lib/utils'

describe('cn utility', () => {
  it('merges class names', () => {
    expect(cn('p-2', 'text-sm')).toBe('p-2 text-sm')
  })

  it('ignores falsy values', () => {
    expect(cn('p-2', false && 'hidden', 'text-sm')).toBe('p-2 text-sm')
  })

  it('merges tailwind classes correctly', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
