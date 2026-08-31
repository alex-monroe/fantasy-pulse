import '@testing-library/jest-dom'
import React from 'react'
import { TextEncoder, TextDecoder } from 'util'

// Polyfill TextEncoder/TextDecoder for jsdom
// @ts-ignore
global.TextEncoder = TextEncoder
// @ts-ignore
global.TextDecoder = TextDecoder

// Mock next/image to simply render an img tag
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => React.createElement('img', props),
}))

// Mock lucide-react icons. Every icon renders as a bare <svg>, resolved
// lazily through a Proxy so adding an icon to a component never means
// adding it to this list too.
jest.mock('lucide-react', () => {
  const iconStubs = new Map<string, unknown>()

  return new Proxy(
    { __esModule: true },
    {
      get(target: Record<string, unknown>, property: string) {
        if (property in target) {
          return target[property]
        }
        // Jest and bundlers probe modules with symbols and `then`; only
        // capitalized names are icons.
        if (typeof property !== 'string' || !/^[A-Z]/.test(property)) {
          return undefined
        }
        if (!iconStubs.has(property)) {
          const Icon = (props: any) => React.createElement('svg', props)
          Icon.displayName = property
          iconStubs.set(property, Icon)
        }
        return iconStubs.get(property)
      },
    },
  )
})
