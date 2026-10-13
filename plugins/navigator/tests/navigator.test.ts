import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { INITIAL_STATE, publishReason, readConfig, splitBlock, withActivation, withTaskCreated, withTaskUpdated, withToolUpdate } from '../hooks/logic'
import type { Config } from '../hooks/logic'
import { renderPage } from '../hooks/page'

const CONFIG: Config = readConfig({}, null)

const withSteps = (n: number, cfg = CONFIG) => {
  let s = INITIAL_STATE
  for (let i = 1; i <= n; i++) s = withActivation(withTaskCreated(s, String(i), `[Block ${i <= 3 ? 'A' : 'B'}] Step ${i}`), cfg)
  return s
}

const page = (s: typeof INITIAL_STATE, config: Config = CONFIG) =>
  renderPage({ state: s, config, project: 'p', now: 0, number: 1, images: {} })

describe('rules', () => {
  test('the bracketed prefix becomes the block', () => {
    expect(splitBlock('[Payments] Migrate invoices')).toEqual({ block: 'Payments', title: 'Migrate invoices' })
    expect(splitBlock('No block')).toEqual({ block: null, title: 'No block' })
  })

  test('starts at the threshold, not before', () => {
    expect(withSteps(4).isActive).toBe(false)
    expect(withSteps(5).isActive).toBe(true)
    expect(withSteps(2, { ...CONFIG, threshold: 2 }).isActive).toBe(true)
    expect(withSteps(9, { ...CONFIG, isEnabled: false }).isActive).toBe(false)
  })

  test('the project override wins over the options, key by key', () => {
    const c = readConfig({ step_threshold: 8, cadence: 'every-change' }, { step_threshold: 3, sections: { pr: false } })
    expect(c.threshold).toBe(3)
    expect(c.cadence).toBe('every-change')
    expect(c.sections).toEqual({ requirements: true, tests: true, pr: false, screenshots: true })
    expect(readConfig({}, { cadence: 'whatever' }).cadence).toBe('step-done')
  })

  test('step-done: publishes when a step finishes, not when it starts', () => {
    const s = withSteps(5)
    const started = withTaskUpdated(s, { taskId: '1', status: 'in_progress' })
    expect(publishReason(s, started, 'step-done', 'list')).toBe(null)
    expect(publishReason(s, started, 'every-change', 'list')).toBe('change')
    const finished = withTaskUpdated(started, { taskId: '1', status: 'completed' })
    expect(publishReason(started, finished, 'step-done', 'list')).toBe('step done')
    expect(publishReason(started, finished, 'block-done', 'list')).toBe(null)
  })

  test('block-done: publishes when a whole block finishes', () => {
    let s = withSteps(5)
    s = withTaskUpdated(s, { taskId: '1', status: 'completed' })
    s = withTaskUpdated(s, { taskId: '2', status: 'completed' })
    const finished = withTaskUpdated(s, { taskId: '3', status: 'completed' })
    expect(publishReason(s, finished, 'block-done', 'list')).toBe('block done')
  })

  test('a blocked step or a decision publishes at every cadence', () => {
    const s = withSteps(5)
    const blocked = withToolUpdate(s, { blocked: [{ step: 'Step 4', reason: 'missing key' }] })
    const decision = withToolUpdate(s, { decisions: [{ question: 'Which plan?' }] })
    for (const cadence of ['step-done', 'every-change', 'block-done'] as const) {
      expect(publishReason(s, blocked, cadence, 'tool')).toBe('step blocked')
      expect(publishReason(s, decision, cadence, 'tool')).toBe('decision')
    }
  })

  test('the page shows steps, blockers, decisions and only the sections turned on', () => {
    let s = withSteps(5)
    s = withTaskUpdated(s, { taskId: '1', status: 'completed' })
    s = withToolUpdate(s, {
      title: 'Stripe payments',
      blocked: [{ step: 'Step 4', reason: 'missing the <live> key' }],
      decisions: [{ question: 'Bill in EUR or AED?' }],
      blocks: [{ name: 'Block A', requirements: ['FR-12'], pr: { state: 'open', number: '130' } }],
    })
    const html = page(s, { ...CONFIG, sections: { ...CONFIG.sections, pr: false } })
    expect(html).toContain('<title>Navigator Stripe payments</title>')
    expect(html).toContain('>20%<')
    expect(html).toContain('Needs you')
    expect(html).toContain('missing the &lt;live&gt; key')
    expect(html).toContain('FR-12')
    expect(html).not.toContain('#130')
  })

  test('English is the default language, Italian can be chosen', () => {
    const s = withToolUpdate(withSteps(5), { decisions: [{ question: 'Q?' }], blocks: [{ name: 'Block A', pr: { state: 'merged' } }] })
    expect(CONFIG.language).toBe('en')
    expect(page(s)).toContain('0 of 5 steps done')
    expect(page(s)).toContain('>merged<')
    expect(page(s)).not.toContain('Serve da te')
    const it = page(s, { ...CONFIG, language: 'it' })
    expect(it).toContain('0 di 5 passi fatti')
    expect(it).toContain('Serve da te')
    expect(it).toContain('>fusa<')
  })

  test('colours: chosen theme, custom ones on top, non-hex values dropped', () => {
    const c = readConfig({ theme: 'muted', color_accent: '#FF0066', color_done: 'red; } body { display:none' }, { colors: { background: '#000' } })
    expect(c.theme).toBe('muted')
    expect(c.colors.accent).toBe('#ff0066')
    expect(c.colors.done).toBe(null)
    expect(c.colors.background).toBe('#000')
    const html = page(withSteps(5), c)
    expect(html).toContain('--accent: #ff0066;')
    expect(html).toContain('--ok: #4f8a6b;')
    expect(html).not.toContain('display:none')
  })

  test('detail: done steps, reasons, context, counts and bars can be turned off', () => {
    let s = withTaskUpdated(withSteps(5), { taskId: '1', status: 'completed' })
    s = withToolUpdate(s, { blocked: [{ step: 'Step 4', reason: 'REASON-X' }], decisions: [{ question: 'Q?', context: 'CONTEXT-Y' }] })
    const c = readConfig({ show_done_steps: false }, { detail: { block_reasons: false, decision_context: false, status_counts: false, progress_bars: false } })
    const html = page(s, c)
    expect(html).not.toContain('Step 1<')
    expect(html).toContain('1 completed step hidden')
    expect(html).not.toContain('REASON-X')
    expect(html).not.toContain('CONTEXT-Y')
    expect(html).not.toContain('role="progressbar"')
    expect(html).not.toContain('class="chips"><span class="pill')
  })
})

// ------------------------------------------------------------ end to end

function world(on: On, registered: string[] = []) {
  const written: Record<string, string> = {}
  const publishes: Record<string, unknown>[] = []
  let nextId = 0
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/project' }))
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.exists', ($, e) => ({ value: e.path in written }))
  on('fs.write', ($, e) => { written[e.path] = e.text; return { value: undefined } })
  on('fs.read', ($, e) => (e.path in written ? { value: written[e.path]! } : { deny: 'ENOENT' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => { registered.push(e.name); return { value: { tool: `mcp__navigator__${e.name}` } } })
  on('tool.list', () => ({ value: [{ name: 'Artifact', description: '', mcp: false }] }))
  on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: String(++nextId), subject: '' } } }))
  on('tool.call', { tool: 'TaskUpdate' }, ($, e) => ({ result: { success: true, taskId: e.taskId, updatedFields: [] } }))
  on('tool.call', { tool: 'Artifact' }, ($, e) => {
    publishes.push(e as unknown as Record<string, unknown>)
    return { result: { url: 'https://claude.ai/code/artifact/abc-123', path: String(e.file_path) } }
  })
  return { written, publishes }
}

test('5 steps: first publish with the link, then the same address', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 13, 12, 0) })
  mock.store(on)
  const session = mock.session(on)
  const { written, publishes } = world(on)
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })

  for (let i = 1; i <= 4; i++) await $.tool.call({ tool: 'TaskCreate', subject: `[Base] Step ${i}`, description: '' })
  await clock.advance(2000)
  expect(publishes).toHaveLength(0)

  await $.tool.call({ tool: 'TaskCreate', subject: '[Base] Step 5', description: '' })
  await clock.advance(2000)
  expect(publishes).toHaveLength(1)
  expect(publishes[0]).toMatchObject({ action: 'publish', file_path: '/project/.claude/navigator/session-1.html', icon: 'chart' })
  expect(written['/project/.claude/navigator/.gitignore']).toBe('*\n')
  const texts = session.appended().map(r => JSON.stringify(r.message.content))
  expect(texts.some(t => t.includes('https://claude.ai/code/artifact/abc-123'))).toBe(true)

  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
  await clock.advance(2000)
  expect(publishes).toHaveLength(1)

  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await clock.advance(2000)
  expect(publishes).toHaveLength(2)
  expect(publishes[1]).toMatchObject({ url: 'https://claude.ai/code/artifact/abc-123' })
  expect(publishes[1]!.icon).toBeUndefined()
  expect(written['/project/.claude/navigator/session-1.html']).toContain('>20%<')
})

test('disabled in the settings: no tool, no publishes', { options: { enabled: false } }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const registered: string[] = []
  const { publishes } = world(on, registered)
  await $.session.start({ cwd: '/project', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= 6; i++) await $.tool.call({ tool: 'TaskCreate', subject: `Step ${i}`, description: '' })
  await clock.advance(5000)
  expect(registered).toHaveLength(0)
  expect(publishes).toHaveLength(0)
})
