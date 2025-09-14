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

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  __esModule: true,
  User: (props: any) => React.createElement('svg', props),
  Users: (props: any) => React.createElement('svg', props),
  CheckCircle2: (props: any) => React.createElement('svg', props),
  XCircle: (props: any) => React.createElement('svg', props),
  AlertCircle: (props: any) => React.createElement('svg', props),
  RefreshCw: (props: any) => React.createElement('svg', props),
}))
