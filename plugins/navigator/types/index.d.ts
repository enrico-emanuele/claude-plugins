export type NavigatorStepStatus = 'todo' | 'in_progress' | 'done'

export type NavigatorStep = {
  id: string
  title: string
  block: string | null
  status: NavigatorStepStatus
  /** When the step reached its current status (ms since the epoch); absent until stamped. */
  since?: number
}

export type NavigatorBlocker = { step: string; reason: string; since?: number }

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

export type NavigatorEventKind = 'job_started' | 'step_done' | 'step_blocked' | 'step_unblocked' | 'decision_opened' | 'decision_closed' | 'block_done' | 'job_done'

/** One line of the page's recent events. */
export type NavigatorEvent = { at: number; kind: NavigatorEventKind; text: string }

/** A subagent at work, as the page shows it. */
export type NavigatorAgent = { description: string; type: string }

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
  /** When the current job started (ms since the epoch). */
  startedAt: number | null
  /** The latest events, newest last, at most 10. */
  events: NavigatorEvent[]
  revision: number
  publishedRevision: number
  url: string | null
  file: string | null
  publishCount: number
  lastPublishedAt: number | null
  error: string | null
  /** Publishing was denied: no more attempts until /navigator publish. */
  isPaused: boolean
  /** Published paths of the screenshots already uploaded to the current address. */
  uploaded: string[]
}

declare module 'claude-code' {
  interface PluginState {
    navigator: { state: NavigatorState }
  }
}
