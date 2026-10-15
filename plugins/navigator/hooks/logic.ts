// The pure part of navigator: settings, state, start and republish rules.
// No `$` in here, so the tests exercise it on its own.

import type {
  NavigatorBlock,
  NavigatorBlocker,
  NavigatorDecision,
  NavigatorEvent,
  NavigatorState,
  NavigatorStep,
  NavigatorStepStatus,
  NavigatorWaiting,
} from '../types'

export type Cadence = 'step-done' | 'every-change' | 'block-done'

export type Sections = { requirements: boolean; tests: boolean; pr: boolean; screenshots: boolean }

export type Language = 'en' | 'it'

export type Theme = 'standard' | 'high-contrast' | 'muted'

export type ColorKey =
  | 'background' | 'surface' | 'text' | 'accent'
  | 'done' | 'in_progress' | 'blocked' | 'todo' | 'attention' | 'waiting'

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
  events: boolean
  times: boolean
  agents: boolean
}

export type Config = {
  isEnabled: boolean
  threshold: number
  cadence: Cadence
  /** At the end of a turn, also publish what the cadence left unpublished. */
  publishAtTurnEnd: boolean
  /** A push notification when a step is blocked or a decision opens. */
  notify: boolean
  sections: Sections
  language: Language
  theme: Theme
  colors: Colors
  detail: Detail
}

export const COLOR_KEYS: readonly ColorKey[] = [
  'background', 'surface', 'text', 'accent', 'done', 'in_progress', 'blocked', 'todo', 'attention', 'waiting',
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
  startedAt: null,
  events: [],
  revision: 0,
  publishedRevision: 0,
  url: null,
  file: null,
  publishCount: 0,
  lastPublishedAt: null,
  error: null,
  isPaused: false,
  uploaded: [],
  waiting: null,
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
    publishAtTurnEnd: asBool(options.publish_at_turn_end, true),
    notify: asBool(options.notify, true),
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
      events: asBool(options.show_events, true),
      times: asBool(options.show_times, true),
      agents: asBool(options.show_agents, true),
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
    publishAtTurnEnd: asBool(o.publish_at_turn_end, base.publishAtTurnEnd),
    notify: asBool(o.notify, base.notify),
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
      events: asBool(d.events, base.detail.events),
      times: asBool(d.times, base.detail.times),
      agents: asBool(d.agents, base.detail.agents),
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

/** Every step of the job is done. */
export const isFinished = (s: NavigatorState) => s.steps.length > 0 && s.steps.every(p => p.status === 'done')

/**
 * A new job in the same session: the old one is finished and a new plan
 * arrives. Steps and the data that went with them start over; the address,
 * the publish count and the uploaded screenshots stay.
 */
export const asNewJob = (s: NavigatorState): NavigatorState => ({
  ...s, title: null, steps: [], blockers: [], decisions: [], blocks: [], startedAt: null, events: [],
})

export function withTaskCreated(s: NavigatorState, id: string, subject: string): NavigatorState {
  const step: NavigatorStep = { id, ...splitBlock(subject), status: 'todo' }
  const base = s.source === 'task' && isFinished(s) ? asNewJob(s) : s
  const steps = base.source === 'task' ? base.steps.filter(p => p.id !== id) : []
  return withRevision(base, { source: 'task', steps: [...steps, step] })
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

const slug = (t: string) =>
  t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

/**
 * Ids that follow the title, not the position: reordering or inserting a todo
 * keeps every other step's id, so blockers and "step done" stay on their step.
 */
function titleIds(prefix: string, titles: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return titles.map((t, i) => {
    const key = slug(splitBlock(t).title) || String(i + 1)
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return `${prefix}-${key}${n > 1 ? `-${n}` : ''}`
  })
}

/** The list handed over replaces a finished job with one that has nothing done yet. */
const startsNewJob = (s: NavigatorState, statuses: readonly NavigatorStepStatus[]) =>
  isFinished(s) && statuses.length > 0 && statuses.every(x => x !== 'done')

export function withTodos(
  s: NavigatorState,
  todos: readonly { content: string; status: string }[],
): NavigatorState {
  const ids = titleIds('todo', todos.map(t => t.content))
  const steps = todos.map((t, i) => ({
    id: ids[i]!,
    ...splitBlock(t.content),
    status: fromTaskStatus(t.status),
  }))
  const base = startsNewJob(s, steps.map(p => p.status)) ? asNewJob(s) : s
  return withRevision(base, { source: 'todo', steps })
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
  if (Array.isArray(a.steps) && (s.source === null || s.source === 'tool')) {
    const statuses = a.steps.map(p => (p.status === 'done' || p.status === 'in_progress' ? p.status : 'todo'))
    if (startsNewJob(s, statuses)) s = asNewJob(s)
  }
  const change: Partial<NavigatorState> = {}
  if (typeof a.title === 'string' && a.title.trim() !== '') change.title = a.title.trim()
  if (Array.isArray(a.steps) && (s.source === null || s.source === 'tool')) {
    change.source = 'tool'
    const ids = titleIds('step', a.steps.map(p => p.title))
    change.steps = a.steps.map((p, i) => {
      const name = splitBlock(p.title)
      return {
        id: ids[i]!,
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

// ---------------------------------------------------------------- history

const MAX_EVENTS = 10

const blockerKey = (f: NavigatorBlocker) => normal(f.step)

/**
 * Stamps what changed from `before` to `after` at `now`: when the job started,
 * when each step reached its status, since when each blocker holds, and the
 * events for the page's recent list. A new job (startedAt back to null)
 * compares against an empty one.
 */
export function withHistory(before: NavigatorState, after: NavigatorState, now: number): NavigatorState {
  if (after.revision === before.revision) return after
  // asNewJob clears startedAt: what was there belongs to the old job.
  const isReset = after.startedAt === null && before.startedAt !== null
  const prev = isReset ? INITIAL_STATE : before
  const isNew = after.startedAt === null
  const steps = after.steps.map(p => {
    const old = prev.steps.find(x => x.id === p.id)
    return old && old.status === p.status && old.since !== undefined ? { ...p, since: old.since } : { ...p, since: now }
  })
  const blockers = after.blockers.map(f => {
    const old = prev.blockers.find(x => blockerKey(x) === blockerKey(f))
    return { ...f, since: old?.since ?? now }
  })
  const events: NavigatorEvent[] = []
  const add = (kind: NavigatorEvent['kind'], text: string) => events.push({ at: now, kind, text })
  if (isNew && steps.length > 0) add('job_started', after.title ?? '')
  const doneBefore = new Set(prev.steps.filter(p => p.status === 'done').map(p => p.id))
  for (const p of steps) if (p.status === 'done' && !doneBefore.has(p.id)) add('step_done', p.title)
  for (const f of blockers) {
    if (!prev.blockers.some(x => blockerKey(x) === blockerKey(f))) add('step_blocked', `${splitBlock(f.step).title}: ${f.reason}`)
  }
  for (const f of prev.blockers) {
    const step = steps.find(p => p.id === f.step || p.title.toLowerCase() === blockerKey(f))
    if (!blockers.some(x => blockerKey(x) === blockerKey(f)) && step?.status !== 'done') add('step_unblocked', splitBlock(f.step).title)
  }
  const questions = (d: readonly NavigatorDecision[]) => new Set(d.map(x => x.question.trim()))
  const qBefore = questions(prev.decisions)
  const qAfter = questions(after.decisions)
  for (const q of qAfter) if (!qBefore.has(q)) add('decision_opened', q)
  for (const q of qBefore) if (!qAfter.has(q)) add('decision_closed', q)
  const next = { ...after, steps, blockers }
  const blocksBefore = doneBlocks(prev)
  for (const name of doneBlocks(next)) if (name !== '' && !blocksBefore.has(name)) add('block_done', name)
  if (isFinished(next) && !isFinished(prev)) add('job_done', after.title ?? '')
  return {
    ...next,
    startedAt: after.startedAt ?? (steps.length > 0 ? now : null),
    events: [...after.events, ...events].slice(-MAX_EVENTS),
  }
}

/** What happened that the user should hear about even away from the page. */
export function attentionEvents(before: NavigatorState, after: NavigatorState): NavigatorEvent[] {
  const known = new Set(before.events.map(x => `${x.at}|${x.kind}|${x.text}`))
  return after.events.filter(x =>
    (x.kind === 'step_blocked' || x.kind === 'decision_opened') && !known.has(`${x.at}|${x.kind}|${x.text}`))
}

// ---------------------------------------------------------------- waiting for the user

/** The longest question the band shows. */
export const MAX_QUESTION = 240

const clip = (t: string) => (t.length > MAX_QUESTION ? `${t.slice(0, MAX_QUESTION - 1).trimEnd()}…` : t)

/**
 * The question a turn's answer ends on, for the band: the last sentence with a
 * question mark, outside code, with markdown marks dropped. Null when the
 * answer asks nothing.
 */
export function questionOf(answer: string): string | null {
  const prose = answer.replace(/```[\s\S]*?(?:```|$)/g, '').replace(/`[^`\n]*`/g, m => m.slice(1, -1))
  const line = prose.split('\n').map(x => x.trim()).filter(x => x.includes('?')).pop()
  if (line === undefined) return null
  const upTo = line.slice(0, line.lastIndexOf('?') + 1)
  // The sentence the question mark closes: after the previous . ! or ? that ends a sentence.
  const start = Math.max(...['. ', '! ', '? '].map(x => upTo.lastIndexOf(x, upTo.length - 2)).map(i => (i < 0 ? 0 : i + 2)))
  const text = upTo.slice(start)
    .replace(/^(?:[#>*+-]+\s+|\d+[.)]\s+)+/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|~~/g, '')
    .replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|[?!.,;:]|$)/g, '$1$2')
    .replace(/^[*_]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 1 ? clip(text) : null
}

/** Claude waits for the user. A wait already on keeps its start; the question is the latest. */
export function withWaiting(s: NavigatorState, question: string | null, now: number): NavigatorState {
  const waiting: NavigatorWaiting = { since: s.waiting?.since ?? now, question: question === null ? null : clip(question) }
  if (s.waiting && s.waiting.question === waiting.question) return s
  return withRevision(s, { waiting })
}

/** Claude is at work again. */
export const withoutWaiting = (s: NavigatorState): NavigatorState =>
  s.waiting === null ? s : withRevision(s, { waiting: null })

/**
 * Whether the end of a turn leaves Claude waiting for the user: the turn
 * answered (not interrupted, not an error), no subagent is still at work, and
 * the job is not over, unless the answer asks something.
 */
export function isWaitingAtTurnEnd(
  s: NavigatorState,
  turn: { reason: string; hasAgentsAtWork: boolean; question: string | null },
): boolean {
  if (!s.isActive || s.isOff || turn.reason !== 'answer' || turn.hasAgentsAtWork) return false
  return !isFinished(s) || turn.question !== null
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
  if ((before.waiting === null) !== (after.waiting === null)) return after.waiting ? 'waiting' : 'waiting over'
  if (after.waiting && before.waiting?.question !== after.waiting.question) return 'waiting'
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

// ---------------------------------------------------------------- publishing

export type PublishFailure = 'denied' | 'gone' | 'transient'

/** The artifact at the old address is gone or cannot be updated from this session. */
const GONE = /not found|no longer exists|does not exist|deleted|\b404\b|not (?:the )?owner|no edit access|not a writer|cannot be updated|can(?:no|')t update|has (?:not|neither) read/i

/**
 * What a failed Artifact call means. A deny is the person (or a rule) saying
 * no: ask again only when they say so. Only an artifact that is really gone
 * gets a new address; anything else is retried at the same one.
 */
export function classifyFailure(r: { deny?: string; isError?: boolean; text?: string; result?: unknown }): PublishFailure {
  if (r.deny !== undefined) return 'denied'
  return GONE.test(failureText(r)) ? 'gone' : 'transient'
}

/** The error's words: what the model would read, else the tool's own record. */
export const failureText = (r: { text?: string; result?: unknown }): string =>
  r.text ?? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result ?? 'unknown error'))

/** A short stable name for a file: FNV-1a, 8 hex digits. */
export function hashName(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
