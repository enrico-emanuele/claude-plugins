// The pure part of navigator: settings, state, start and republish rules.
// No `$` in here, so the tests exercise it on its own.

import type {
  NavigatorBlock,
  NavigatorBlocker,
  NavigatorDecision,
  NavigatorState,
  NavigatorStep,
  NavigatorStepStatus,
} from '../types'

export type Cadence = 'step-done' | 'every-change' | 'block-done'

export type Sections = { requirements: boolean; tests: boolean; pr: boolean; screenshots: boolean }

export type Language = 'en' | 'it'

export type Theme = 'standard' | 'high-contrast' | 'muted'

export type ColorKey =
  | 'background' | 'surface' | 'text' | 'accent'
  | 'done' | 'in_progress' | 'blocked' | 'todo' | 'attention'

/** The page colours; null = the theme's. */
export type Colors = Record<ColorKey, string | null>

/** What the page shows, beyond the sections. */
export type Detail = {
  doneSteps: boolean
  blockReasons: boolean
  decisionContext: boolean
  statusCounts: boolean
  progressBars: boolean
  collapseDoneBlocks: boolean
  testNotes: boolean
}

export type Config = {
  isEnabled: boolean
  threshold: number
  cadence: Cadence
  sections: Sections
  language: Language
  theme: Theme
  colors: Colors
  detail: Detail
}

export const COLOR_KEYS: readonly ColorKey[] = [
  'background', 'surface', 'text', 'accent', 'done', 'in_progress', 'blocked', 'todo', 'attention',
]

const CADENCES: readonly Cadence[] = ['step-done', 'every-change', 'block-done']
const LANGUAGES: readonly Language[] = ['en', 'it']
const THEMES: readonly Theme[] = ['standard', 'high-contrast', 'muted']

export const INITIAL_STATE: NavigatorState = {
  isActive: false,
  isOff: false,
  isForced: false,
  title: null,
  source: null,
  steps: [],
  blockers: [],
  decisions: [],
  blocks: [],
  revision: 0,
  publishedRevision: 0,
  url: null,
  file: null,
  publishCount: 0,
  lastPublishedAt: null,
  error: null,
}

// ---------------------------------------------------------------- settings

type Options = Readonly<Record<string, unknown>>

const asBool = (v: unknown, base: boolean): boolean => (typeof v === 'boolean' ? v : base)

const asThreshold = (v: unknown, base: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : base

const asOneOf = <T extends string>(list: readonly T[]) => (v: unknown, base: T): T =>
  list.includes(v as T) ? (v as T) : base

const asCadence = asOneOf(CADENCES)
const asLanguage = asOneOf(LANGUAGES)
const asTheme = asOneOf(THEMES)

/** Hex only (#rgb, #rgba, #rrggbb, #rrggbbaa): nothing else reaches the page's CSS. */
const asColor = (v: unknown, base: string | null): string | null => {
  if (typeof v !== 'string') return base
  const t = v.trim()
  if (t === '') return base
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t) ? t.toLowerCase() : base
}

const asObject = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {}

/**
 * The plugin's options (userConfig) with the project override,
 * `.claude/navigator.json`, on top: a key the override leaves out keeps the
 * user's value. An invalid value counts as left out.
 */
export function readConfig(options: Options, override: unknown): Config {
  const colors = {} as Colors
  for (const k of COLOR_KEYS) colors[k] = asColor(options[`color_${k}`], null)
  const base: Config = {
    isEnabled: asBool(options.enabled, true),
    threshold: asThreshold(options.step_threshold, 5),
    cadence: asCadence(options.cadence, 'step-done'),
    sections: {
      requirements: asBool(options.section_requirements, true),
      tests: asBool(options.section_tests, true),
      pr: asBool(options.section_pr, true),
      screenshots: asBool(options.section_screenshots, true),
    },
    language: asLanguage(options.language, 'en'),
    theme: asTheme(options.theme, 'standard'),
    colors,
    detail: {
      doneSteps: asBool(options.show_done_steps, true),
      blockReasons: asBool(options.show_block_reasons, true),
      decisionContext: asBool(options.show_decision_context, true),
      statusCounts: asBool(options.show_status_counts, true),
      progressBars: asBool(options.show_progress_bars, true),
      collapseDoneBlocks: asBool(options.collapse_done_blocks, true),
      testNotes: asBool(options.show_test_notes, true),
    },
  }
  if (override === null || typeof override !== 'object') return base
  const o = override as Record<string, unknown>
  const s = asObject(o.sections)
  const c = asObject(o.colors)
  const d = asObject(o.detail)
  const overrideColors = {} as Colors
  for (const k of COLOR_KEYS) overrideColors[k] = asColor(c[k], base.colors[k])
  return {
    isEnabled: asBool(o.enabled, base.isEnabled),
    threshold: asThreshold(o.step_threshold, base.threshold),
    cadence: asCadence(o.cadence, base.cadence),
    sections: {
      requirements: asBool(s.requirements, base.sections.requirements),
      tests: asBool(s.tests, base.sections.tests),
      pr: asBool(s.pr, base.sections.pr),
      screenshots: asBool(s.screenshots, base.sections.screenshots),
    },
    language: asLanguage(o.language, base.language),
    theme: asTheme(o.theme, base.theme),
    colors: overrideColors,
    detail: {
      doneSteps: asBool(d.done_steps, base.detail.doneSteps),
      blockReasons: asBool(d.block_reasons, base.detail.blockReasons),
      decisionContext: asBool(d.decision_context, base.detail.decisionContext),
      statusCounts: asBool(d.status_counts, base.detail.statusCounts),
      progressBars: asBool(d.progress_bars, base.detail.progressBars),
      collapseDoneBlocks: asBool(d.collapse_done_blocks, base.detail.collapseDoneBlocks),
      testNotes: asBool(d.test_notes, base.detail.testNotes),
    },
  }
}

// ---------------------------------------------------------------- steps

const BLOCK_PREFIX = /^\s*\[([^\]]{1,80})\]\s*(.+)$/s

/** "[Payments] Migrate invoices" → block "Payments", title "Migrate invoices". */
export function splitBlock(text: string): { block: string | null; title: string } {
  const m = BLOCK_PREFIX.exec(text)
  return m ? { block: m[1]!.trim(), title: m[2]!.trim() } : { block: null, title: text.trim() }
}

const fromTaskStatus = (s: string | undefined): NavigatorStepStatus =>
  s === 'completed' ? 'done' : s === 'in_progress' ? 'in_progress' : 'todo'

const withRevision = (s: NavigatorState, change: Partial<NavigatorState>): NavigatorState => ({
  ...s,
  ...change,
  revision: s.revision + 1,
})

export function withTaskCreated(s: NavigatorState, id: string, subject: string): NavigatorState {
  const step: NavigatorStep = { id, ...splitBlock(subject), status: 'todo' }
  const steps = s.source === 'task' ? s.steps.filter(p => p.id !== id) : []
  return withRevision(s, { source: 'task', steps: [...steps, step] })
}

export function withTaskUpdated(
  s: NavigatorState,
  u: { taskId: string; subject?: string; status?: string },
): NavigatorState {
  if (s.source !== 'task' || !s.steps.some(p => p.id === u.taskId)) return s
  if (u.status === 'deleted') {
    return withRevision(s, { steps: s.steps.filter(p => p.id !== u.taskId) })
  }
  const steps = s.steps.map(p => {
    if (p.id !== u.taskId) return p
    const name = u.subject === undefined ? {} : splitBlock(u.subject)
    const status = u.status === undefined ? p.status : fromTaskStatus(u.status)
    return { ...p, ...name, status }
  })
  return withRevision(s, { steps })
}

export function withTodos(
  s: NavigatorState,
  todos: readonly { content: string; status: string }[],
): NavigatorState {
  const steps = todos.map((t, i) => ({
    id: `todo-${i + 1}`,
    ...splitBlock(t.content),
    status: fromTaskStatus(t.status),
  }))
  return withRevision(s, { source: 'todo', steps })
}

// ---------------------------------------------------------------- tool

export type ToolUpdate = {
  title?: string
  steps?: { title: string; status: NavigatorStepStatus; block?: string }[]
  blocked?: NavigatorBlocker[]
  decisions?: NavigatorDecision[]
  blocks?: NavigatorBlock[]
}

/**
 * Applies one call of the `update` tool. `steps` counts only when the session
 * has no task list (TaskCreate/TodoWrite): that list stays the source.
 * `blocked` and `decisions` replace the whole list; `blocks` merges by name,
 * field by field.
 */
export function withToolUpdate(s: NavigatorState, a: ToolUpdate): NavigatorState {
  const change: Partial<NavigatorState> = {}
  if (typeof a.title === 'string' && a.title.trim() !== '') change.title = a.title.trim()
  if (Array.isArray(a.steps) && (s.source === null || s.source === 'tool')) {
    change.source = 'tool'
    change.steps = a.steps.map((p, i) => {
      const name = splitBlock(p.title)
      return {
        id: `step-${i + 1}`,
        title: name.title,
        block: p.block?.trim() || name.block,
        status: p.status === 'done' || p.status === 'in_progress' ? p.status : 'todo',
      }
    })
  }
  if (Array.isArray(a.blocked)) change.blockers = a.blocked.filter(f => f.step && f.reason)
  if (Array.isArray(a.decisions)) change.decisions = a.decisions.filter(d => d.question)
  if (Array.isArray(a.blocks)) {
    const blocks = [...s.blocks]
    for (const b of a.blocks) {
      if (!b.name) continue
      const i = blocks.findIndex(x => x.name.toLowerCase() === b.name.toLowerCase())
      if (i < 0) blocks.push(b)
      else blocks[i] = { ...blocks[i]!, ...b, name: blocks[i]!.name }
    }
    change.blocks = blocks
  }
  return withRevision(s, change)
}

// ---------------------------------------------------------------- reading

export type ShownStatus = NavigatorStepStatus | 'blocked'

const normal = (t: string) => splitBlock(t).title.toLowerCase()

/** The blocker for this step, if any: by id, then by title. */
export function blockerOf(s: NavigatorState, p: NavigatorStep): NavigatorBlocker | undefined {
  const title = p.title.toLowerCase()
  return s.blockers.find(f => f.step === p.id || normal(f.step) === title)
}

/** A done step is never blocked: a blocker holds while the step is open. */
export const shownStatus = (s: NavigatorState, p: NavigatorStep): ShownStatus =>
  p.status !== 'done' && blockerOf(s, p) ? 'blocked' : p.status

export function percent(steps: readonly NavigatorStep[]): number {
  if (steps.length === 0) return 0
  return Math.round((steps.filter(p => p.status === 'done').length / steps.length) * 100)
}

export type Group = { name: string | null; steps: NavigatorStep[]; data: NavigatorBlock | undefined }

/** Steps grouped by block, in the order the blocks first appear. */
export function groupSteps(s: NavigatorState): Group[] {
  const groups: Group[] = []
  const find = (name: string | null) => {
    const key = name?.toLowerCase() ?? null
    let g = groups.find(x => (x.name?.toLowerCase() ?? null) === key)
    if (!g) {
      const data = name === null ? undefined : s.blocks.find(b => b.name.toLowerCase() === key)
      g = { name, steps: [], data }
      groups.push(g)
    }
    return g
  }
  for (const p of s.steps) find(p.block).steps.push(p)
  for (const b of s.blocks) find(b.name)
  return groups
}

// ---------------------------------------------------------------- rules

/** Starts once per session: at the threshold, or by hand with /navigator publish. */
export function withActivation(s: NavigatorState, c: Config): NavigatorState {
  if (s.isActive || s.isOff || !c.isEnabled) return s
  if (!s.isForced && s.steps.length < c.threshold) return s
  return { ...s, isActive: true }
}

const doneIds = (s: NavigatorState) => new Set(s.steps.filter(p => p.status === 'done').map(p => p.id))

const doneBlocks = (s: NavigatorState) =>
  new Set(
    groupSteps(s)
      .filter(g => g.steps.length > 0 && g.steps.every(p => p.status === 'done'))
      .map(g => g.name ?? ''),
  )

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export type Origin = 'list' | 'tool'

/**
 * Why to republish right after going from `before` to `after`, or null.
 * Activation, blockers, decisions and the end of the job publish at every
 * cadence; the rest depends on the cadence chosen.
 */
export function publishReason(
  before: NavigatorState,
  after: NavigatorState,
  cadence: Cadence,
  origin: Origin,
): string | null {
  if (!after.isActive || after.isOff) return null
  if (!before.isActive) return 'activation'
  if (after.revision === before.revision) return null
  const newBlockers = after.blockers.some(f => !before.blockers.some(g => sameJson(f, g)))
  if (newBlockers) return 'step blocked'
  if (!sameJson(before.decisions, after.decisions) && after.decisions.length > 0) return 'decision'
  const all = (s: NavigatorState) => s.steps.length > 0 && percent(s.steps) === 100
  if (all(after) && !all(before)) return 'job done'
  if (cadence === 'every-change') return 'change'
  if (cadence === 'step-done') {
    const already = doneIds(before)
    if ([...doneIds(after)].some(id => !already.has(id))) return 'step done'
    if (origin === 'tool') return 'block data'
    return null
  }
  const alreadyDone = doneBlocks(before)
  if ([...doneBlocks(after)].some(n => !alreadyDone.has(n))) return 'block done'
  return null
}

/** There are changes not yet published. */
export const isDirty = (s: NavigatorState) => s.revision !== s.publishedRevision
