import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { CommandRunInput, On, TurnCompleteInput } from 'claude-code'

import {
  INITIAL_STATE,
  attentionEvents,
  classifyFailure,
  publishReason,
  readConfig,
  withActivation,
  withHistory,
  withTaskCreated,
  withTaskUpdated,
  withTodos,
  withToolUpdate,
} from '../hooks/logic'
import type { Config } from '../hooks/logic'
import { duration, renderPage } from '../hooks/page'
import type { NavigatorState } from '../types'

const CONFIG: Config = readConfig({}, null)

const page = (s: NavigatorState, extra: Partial<Parameters<typeof renderPage>[0]> = {}) =>
  renderPage({ state: s, config: CONFIG, project: 'p', now: 10 * 60_000, number: 1, images: {}, ...extra })

const todos = (...items: [string, string][]) => items.map(([content, status]) => ({ content, status }))

/** A finished job of `n` task steps. */
const finished = (n: number) => {
  let s = INITIAL_STATE
  for (let i = 1; i <= n; i++) s = withActivation(withTaskCreated(s, String(i), `Step ${i}`), CONFIG)
  for (let i = 1; i <= n; i++) s = withTaskUpdated(s, { taskId: String(i), status: 'completed' })
  return s
}

describe('step ids and jobs', () => {
  test('TodoWrite: reordering or inserting keeps each step its id and its blocker', () => {
    let s = withTodos(INITIAL_STATE, todos(['Write schema', 'pending'], ['Run migration', 'pending']))
    s = withToolUpdate(s, { blocked: [{ step: s.steps[1]!.id, reason: 'no DB access' }] })
    const moved = withTodos(s, todos(['Read docs', 'completed'], ['Run migration', 'pending'], ['Write schema', 'pending']))
    expect(moved.steps.map(p => p.id)).toEqual(['todo-read-docs', 'todo-run-migration', 'todo-write-schema'])
    expect(moved.blockers[0]!.step).toBe('todo-run-migration')
    // A step added already done is a real "step done"; moving the others is not.
    const reordered = withTodos(s, todos(['Run migration', 'pending'], ['Write schema', 'pending']))
    expect(publishReason({ ...s, isActive: true }, { ...reordered, isActive: true }, 'step-done', 'list')).toBe(null)
  })

  test('duplicate titles get their own ids', () => {
    const s = withTodos(INITIAL_STATE, todos(['Deploy', 'pending'], ['Deploy', 'pending']))
    expect(s.steps.map(p => p.id)).toEqual(['todo-deploy', 'todo-deploy-2'])
  })

  test('a new plan after a finished job starts a new job', () => {
    let s = withToolUpdate(finished(5), { title: 'Old', decisions: [{ question: 'Old?' }], blocks: [{ name: 'X', requirements: ['R1'] }] })
    s = { ...s, url: 'https://claude.ai/code/artifact/a', publishCount: 3, startedAt: 1 }
    const next = withTaskCreated(s, '6', 'New step')
    expect(next.steps.map(p => p.title)).toEqual(['New step'])
    expect(next.decisions).toEqual([])
    expect(next.blocks).toEqual([])
    expect(next.title).toBe(null)
    expect(next.startedAt).toBe(null)
    expect(next.url).toBe(s.url)
    expect(next.publishCount).toBe(3)
    // An unfinished job keeps adding steps.
    const open = withTaskCreated(withTaskUpdated(s, { taskId: '5', status: 'in_progress' }), '6', 'More')
    expect(open.steps).toHaveLength(6)
    // TodoWrite: a fresh list over a finished one starts over too.
    const done = withTodos(INITIAL_STATE, todos(['A', 'completed']))
    expect(withTodos(withToolUpdate(done, { decisions: [{ question: 'Q?' }] }), todos(['B', 'pending'])).decisions).toEqual([])
  })
})

describe('history', () => {
  test('times: start of the job, since when a step and a blocker hold', () => {
    let s = INITIAL_STATE
    const step = (fn: (x: NavigatorState) => NavigatorState, now: number) => { s = withHistory(s, fn(s), now) }
    step(x => withTaskCreated(x, '1', 'One'), 1000)
    expect(s.startedAt).toBe(1000)
    expect(s.steps[0]!.since).toBe(1000)
    step(x => withTaskCreated(x, '2', 'Two'), 2000)
    expect(s.steps[0]!.since).toBe(1000)
    step(x => withTaskUpdated(x, { taskId: '1', status: 'in_progress' }), 3000)
    expect(s.steps[0]!.since).toBe(3000)
    step(x => withToolUpdate(x, { blocked: [{ step: 'Two', reason: 'r' }] }), 4000)
    step(x => withToolUpdate(x, { blocked: [{ step: 'Two', reason: 'r, still' }] }), 5000)
    expect(s.blockers[0]!.since).toBe(4000)
    expect(s.startedAt).toBe(1000)
  })

  test('events: done, blocked, unblocked, decisions, block and job done; at most 10', () => {
    let s = INITIAL_STATE
    const step = (fn: (x: NavigatorState) => NavigatorState, now = 1) => { s = withHistory(s, fn(s), now) }
    step(x => withTaskCreated(x, '1', '[A] One'))
    step(x => withTaskCreated(x, '2', '[B] Two'))
    step(x => withToolUpdate(x, { blocked: [{ step: 'Two', reason: 'key' }], decisions: [{ question: 'EUR?' }] }))
    step(x => withToolUpdate(x, { blocked: [], decisions: [] }))
    step(x => withTaskUpdated(x, { taskId: '1', status: 'completed' }))
    step(x => withTaskUpdated(x, { taskId: '2', status: 'completed' }))
    expect(s.events.map(e => e.kind)).toEqual([
      'job_started', 'step_blocked', 'decision_opened', 'step_unblocked', 'decision_closed',
      'step_done', 'block_done', 'step_done', 'block_done', 'job_done',
    ])
    expect(s.events[1]!.text).toBe('Two: key')
    step(x => withToolUpdate(x, { decisions: [{ question: 'More?' }] }))
    expect(s.events).toHaveLength(10)
    expect(s.events.at(-1)!.kind).toBe('decision_opened')
  })

  test('only new blockers and decisions call for a notification', () => {
    const a = withHistory(INITIAL_STATE, withTaskCreated(INITIAL_STATE, '1', 'One'), 1)
    const b = withHistory(a, withToolUpdate(a, { blocked: [{ step: 'One', reason: 'r' }] }), 2)
    expect(attentionEvents(a, b).map(e => e.kind)).toEqual(['step_blocked'])
    const c = withHistory(b, withToolUpdate(b, { title: 'T' }), 3)
    expect(attentionEvents(b, c)).toEqual([])
  })
})

describe('page', () => {
  test('titles, reasons, decisions and block names are escaped', () => {
    let s = withActivation(withTaskCreated(INITIAL_STATE, '1', '[<b>x</b>] <img src=x onerror=alert(1)>'), { ...CONFIG, threshold: 1 })
    s = withToolUpdate(s, {
      title: '<script>alert(1)</script>',
      decisions: [{ question: '"quoted" & <tag>', context: '<i>c</i>' }],
      blocked: [{ step: '1', reason: '<u>r</u>' }],
    })
    const html = page(s)
    expect(html).not.toContain('<script>alert(1)')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&quot;quoted&quot; &amp; &lt;tag&gt;')
    expect(html).toContain('&lt;u&gt;r&lt;/u&gt;')
  })

  test('times, events and agents show, and can be turned off', () => {
    let s = withHistory(INITIAL_STATE, withActivation(withTaskCreated(INITIAL_STATE, '1', 'One'), { ...CONFIG, threshold: 1 }), 0)
    s = withHistory(s, withTaskUpdated(s, { taskId: '1', status: 'in_progress' }), 60_000)
    const agents = [{ description: 'Scan the repo', type: 'Explore' }]
    const html = page(s, { agents })
    expect(html).toContain('running for <time data-since="0">10 min</time>')
    expect(html).toContain('for <time data-since="60000">9 min</time>')
    expect(html).toContain('Recent events')
    expect(html).toContain('1 agent at work')
    expect(html).toContain('Scan the repo')
    const off = page(s, { agents, config: readConfig({ show_times: false, show_events: false, show_agents: false }, null) })
    expect(off).not.toContain('<time data-since')
    expect(off).not.toContain('Recent events')
    expect(off).not.toContain('Scan the repo')
    expect(page(s, { config: { ...CONFIG, language: 'it' } })).toContain('Ultimi eventi')
  })

  test('the footer does not promise a refresh the page cannot do', () => {
    expect(page(INITIAL_STATE)).not.toContain('refreshes on its own')
  })

  test('durations', () => {
    const u = { day: 'd', hour: 'h', minute: 'min', underMinute: '<1 min' }
    expect(duration(30_000, u)).toBe('<1 min')
    expect(duration(5 * 60_000, u)).toBe('5 min')
    expect(duration(125 * 60_000, u)).toBe('2 h 05 min')
    expect(duration((26 * 60 + 5) * 60_000, u)).toBe('1 d 2 h')
  })
})

describe('publishing failures', () => {
  test('a deny pauses, a gone artifact moves, anything else retries in place', () => {
    expect(classifyFailure({ deny: 'The user said no' })).toBe('denied')
    expect(classifyFailure({ isError: true, text: 'Artifact not found' })).toBe('gone')
    expect(classifyFailure({ isError: true, text: 'A publish to an artifact this conversation has not read or published is refused' })).toBe('gone')
    expect(classifyFailure({ isError: true, text: 'ETIMEDOUT while uploading' })).toBe('transient')
    expect(classifyFailure({ isError: true, text: '503 Service Unavailable' })).toBe('transient')
  })
})

// ------------------------------------------------------------ end to end

type Reply = { url?: string; deny?: string; error?: string }

function world(on: On, opts: { files?: Record<string, string>; bytes?: Record<string, string>; push?: string[] } = {}) {
  const written: Record<string, string> = { ...opts.files }
  const publishes: Record<string, unknown>[] = []
  const replies: Reply[] = []
  let nextId = 0
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/project' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.exists', ($, e) => ({ value: e.path in written }))
  on('fs.write', ($, e) => { written[e.path] = e.text; return { value: undefined } })
  on('fs.read', ($, e) => (opts.bytes && e.path in opts.bytes
    ? { value: { base64: opts.bytes[e.path]! } }
    : e.path in written ? { value: written[e.path]! } : { deny: 'ENOENT' }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.stat', ($, e) => (e.path in written
    ? { value: { kind: 'file' as const, size: written[e.path]!.length, mtimeMs: 7, isLink: false } }
    : { deny: 'ENOENT' }))
  on('agent.list', () => ({ value: [] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__navigator__${e.name}` } }))
  on('tool.list', () => ({ value: [{ name: 'Artifact', description: '', mcp: false }, { name: 'PushNotification', description: '', mcp: false }] }))
  on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: String(++nextId), subject: '' } } }))
  on('tool.call', { tool: 'TaskUpdate' }, ($, e) => ({ result: { success: true, taskId: e.taskId, updatedFields: [] } }))
  on('tool.call', { tool: 'PushNotification' }, ($, e) => { opts.push?.push(e.message); return { result: { message: e.message } } })
  on('tool.call', { tool: 'Artifact' }, ($, e) => {
    publishes.push(e as unknown as Record<string, unknown>)
    const r = replies.shift() ?? { url: 'https://claude.ai/code/artifact/abc-123' }
    if (r.deny) return { deny: r.deny }
    if (r.error) return { result: r.error, isError: true }
    return { result: { url: r.url, path: String(e.file_path) } }
  })
  return { written, publishes, replies }
}

async function start($: Engine, on: On, n = 5) {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 13, 12, 0) })
  mock.store(on)
  mock.session(on)
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= n; i++) await $.tool.call({ tool: 'TaskCreate', subject: `[Base] Step ${i}`, description: '' })
  await clock.advance(2000)
  return clock
}

const endTurn = ($: Engine) =>
  $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as TurnCompleteInput)

const cmd = ($: Engine, args: string) => $.command.run({ command: 'navigator', args } as CommandRunInput)

const finish = ($: Engine, id: number) => $.tool.call({ tool: 'TaskUpdate', taskId: String(id), status: 'completed' })

test('a denied publish pauses: no second prompt, no retry at the end of the turn', async ($, on) => {
  const w = world(on)
  const clock = await start($, on)
  expect(w.publishes).toHaveLength(1)
  w.replies.push({ deny: 'The user denied this' })
  await finish($, 1)
  await clock.advance(2000)
  expect(w.publishes).toHaveLength(2)
  await endTurn($)
  await finish($, 2)
  await clock.advance(2000)
  expect(w.publishes).toHaveLength(2)
  const status = await cmd($, '')
  expect(status.text).toContain('Paused')
  await cmd($, 'publish')
  await clock.advance(10)
  expect(w.publishes).toHaveLength(3)
  expect(w.publishes[2]).toMatchObject({ url: 'https://claude.ai/code/artifact/abc-123' })
})

test('a temporary error keeps the address; a gone artifact gets a new one', async ($, on) => {
  const w = world(on)
  const clock = await start($, on)
  w.replies.push({ error: 'ETIMEDOUT' })
  await finish($, 1)
  await clock.advance(2000)
  expect(w.publishes).toHaveLength(2)
  expect(w.publishes[1]!.url).toBe('https://claude.ai/code/artifact/abc-123')
  // Retried at the end of the turn, at the same address.
  await endTurn($)
  await clock.advance(10)
  expect(w.publishes).toHaveLength(3)
  expect(w.publishes[2]!.url).toBe('https://claude.ai/code/artifact/abc-123')
  w.replies.push({ error: 'Artifact not found' }, { url: 'https://claude.ai/code/artifact/new-1' })
  await finish($, 2)
  await clock.advance(2000)
  expect(w.publishes).toHaveLength(5)
  expect(w.publishes[4]!.url).toBeUndefined()
  expect((await cmd($, 'link')).text).toBe('https://claude.ai/code/artifact/new-1')
})

test('publish_at_turn_end off: the end of a turn publishes only what the cadence asks', { options: { publish_at_turn_end: false } }, async ($, on) => {
  const w = world(on)
  const clock = await start($, on)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
  await endTurn($)
  await clock.advance(2000)
  expect(w.publishes).toHaveLength(1)
})

test('every-change publishes on a step that only starts', { options: { cadence: 'every-change' } }, async ($, on) => {
  const w = world(on)
  const clock = await start($, on)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
  await clock.advance(2000)
  expect(w.publishes).toHaveLength(2)
})

test('screenshots in the project go up once as files; outside it they are inlined', async ($, on) => {
  const w = world(on, { files: { '/project/shots/home.png': 'PNG', '/elsewhere/x.png': 'PNG' }, bytes: { '/elsewhere/x.png': 'QUJD' } })
  const clock = await start($, on)
  await $.tool.call({ tool: 'mcp__navigator__update', blocks: [{ name: 'Base', screenshots: [{ path: 'shots/home.png' }, { path: '/elsewhere/x.png' }] }] })
  await clock.advance(2000)
  expect(w.publishes).toHaveLength(2)
  const files = w.publishes[1]!.files as Record<string, string>
  const [name] = Object.keys(files)
  expect(files[name!]).toBe('/project/shots/home.png')
  const html = w.written['/project/.claude/navigator/session-1.html']!
  expect(html).toContain(`src="${name}"`)
  expect(html).toContain('src="data:image/png;base64,QUJD"')
  await finish($, 1)
  await clock.advance(2000)
  expect(w.publishes).toHaveLength(3)
  expect(w.publishes[2]!.files).toBeUndefined()
})

test('a new blocker sends one push notification', async ($, on) => {
  const push: string[] = []
  world(on, { push })
  const clock = await start($, on)
  await $.tool.call({ tool: 'mcp__navigator__update', blocked: [{ step: 'Step 2', reason: 'missing key' }] })
  await clock.advance(2000)
  expect(push).toEqual(['Step blocked: Step 2: missing key'])
  await $.tool.call({ tool: 'mcp__navigator__update', title: 'Payments' })
  expect(push).toHaveLength(1)
})

test('/navigator reset, link, usage, and messages in the page language', { options: { language: 'it' } }, async ($, on) => {
  world(on)
  await start($, on)
  expect((await cmd($, 'link')).text).toBe('https://claude.ai/code/artifact/abc-123')
  expect((await cmd($, 'reset')).text).toContain('nuovo lavoro')
  expect((await cmd($, '')).text).toContain('Attivo: 0% (0/0 passi)')
  expect((await cmd($, 'boh')).text).toContain('Uso:')
})

test('an edit to .claude/navigator.json counts at the next publish', async ($, on) => {
  const w = world(on)
  const clock = await start($, on)
  w.written['/project/.claude/navigator.json'] = JSON.stringify({ language: 'it' })
  await finish($, 1)
  await clock.advance(2000)
  expect(w.written['/project/.claude/navigator/session-1.html']).toContain('passi fatti')
})
