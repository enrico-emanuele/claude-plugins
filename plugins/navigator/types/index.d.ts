export type NavigatorStepStatus = 'todo' | 'in_progress' | 'done'

export type NavigatorStep = {
  id: string
  title: string
  block: string | null
  status: NavigatorStepStatus
}

export type NavigatorBlocker = { step: string; reason: string }

export type NavigatorDecision = { question: string; context?: string; block?: string }

export type NavigatorTests = { passed: number; total: number; note?: string }

export type NavigatorPrState = 'draft' | 'open' | 'in_review' | 'approved' | 'merged' | 'closed'

export type NavigatorPr = { state: NavigatorPrState | string; number?: string; url?: string; title?: string }

export type NavigatorScreenshot = { path: string; caption?: string }

export type NavigatorBlock = {
  name: string
  requirements?: string[]
  tests?: NavigatorTests
  pr?: NavigatorPr
  screenshots?: NavigatorScreenshot[]
}

export type NavigatorSource = 'task' | 'todo' | 'tool'

export type NavigatorState = {
  isActive: boolean
  isOff: boolean
  isForced: boolean
  title: string | null
  source: NavigatorSource | null
  steps: NavigatorStep[]
  blockers: NavigatorBlocker[]
  decisions: NavigatorDecision[]
  blocks: NavigatorBlock[]
  revision: number
  publishedRevision: number
  url: string | null
  file: string | null
  publishCount: number
  lastPublishedAt: number | null
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    navigator: { state: NavigatorState }
  }
}
