import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { NavigatorState } from '../types'
import type { Config, Origin, ToolUpdate } from './logic'
import {
  INITIAL_STATE,
  isDirty,
  percent,
  publishReason,
  readConfig,
  withActivation,
  withTaskCreated,
  withTaskUpdated,
  withTodos,
  withToolUpdate,
} from './logic'
import { pageTitle, renderPage } from './page'

const state = atom({ plugin: 'navigator', key: 'state' } as const, INITIAL_STATE)

const TOOL = 'update'
const TOOL_NAME = 'mcp__navigator__update'
const DELAY_MS = 1500
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

type $ = EngineInterface

let config: Config = readConfig({}, null)
let timer: { cancel: () => void } | null = null
let isPublishing = false
let isPending = false

// ------------------------------------------------------------ publishing

async function readOverride($: $): Promise<unknown> {
  try {
    const file = `${await $.session.root()}/.claude/navigator.json`
    return (await $.fs.exists(file)) ? JSON.parse(await $.fs.read(file)) : null
  } catch {
    return null
  }
}

async function loadImages($: $, s: NavigatorState, root: string) {
  const out: Record<string, string | null> = {}
  if (!config.sections.screenshots) return out
  let total = 0
  const paths = s.blocks.flatMap(b => (b.screenshots ?? []).slice(-4).map(x => x.path))
  for (const path of paths) {
    const mime = MIME[path.split('.').pop()?.toLowerCase() ?? '']
    if (!mime) { out[path] = null; continue }
    try {
      const absolute = path.startsWith('/') ? path : `${root}/${path}`
      const { base64 } = await $.fs.read(absolute, { as: 'bytes' })
      total += base64.length
      out[path] = total > MAX_IMAGE_BYTES ? null : `data:${mime};base64,${base64}`
    } catch {
      out[path] = null
    }
  }
  return out
}

async function announceLink($: $, url: string, isFirst: boolean) {
  const text = isFirst
    ? `Navigator published: ${url}`
    : `Navigator has a new address: ${url}`
  $.ui.toast(text, { timeoutMs: 10000 })
  await $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] } })
  await $.session.append({
    message: {
      type: 'user',
      content: [{
        type: 'text',
        text: `[navigator plugin] ${text}. Give the user this link in your next message, once; no need to repeat it after that. The plugin republishes it at the same address on its own.`,
      }],
    },
  })
}

async function publish($: $): Promise<void> {
  timer = null
  if (isPublishing) { isPending = true; return }
  const s = await read($, state)
  if (!s.isActive || s.isOff) return
  isPublishing = true
  try {
    const root = await $.session.root()
    const session = await $.session.id()
    const folder = `${root}/.claude/navigator`
    const file = `${folder}/${session}.html`
    const project = root.split('/').filter(Boolean).pop() ?? 'project'
    const now = await $.clock.now()
    if (!(await $.fs.exists(`${folder}/.gitignore`))) await $.fs.write(`${folder}/.gitignore`, '*\n')
    const html = renderPage({
      state: s, config, project, now, number: s.publishCount + 1,
      images: await loadImages($, s, root),
    })
    await $.fs.write(file, html)

    const tools = await $.tool.list()
    if (!tools.some(t => t.name === 'Artifact')) {
      if (s.file !== file) $.ui.toast(`Navigator saved locally (Artifact not available): ${file}`, { timeoutMs: 10000 })
      await update($, state, x => ({ ...x, file, publishedRevision: s.revision, error: 'Artifact is not available in this session' }))
      return
    }

    const base = {
      tool: 'Artifact' as const,
      action: 'publish' as const,
      file_path: file,
      description: `Progress of "${pageTitle(s, project).replace(/^Navigator /, '')}": steps, blocks and open decisions.`,
    }
    let result = await $.tool.call(s.url ? { ...base, url: s.url } : { ...base, icon: 'chart' })
    if (s.url && (result.deny !== undefined || result.isError === true)) {
      // The old address cannot be updated (resumed session, deleted artifact): open a new one.
      result = await $.tool.call({ ...base, icon: 'chart' })
    }
    if (result.deny !== undefined || result.isError === true) {
      const reason = (result.deny ?? result.text ?? 'unknown error').slice(0, 300)
      $.ui.toast(`Navigator: publishing failed. ${reason}`, { timeoutMs: 8000 })
      await update($, state, x => ({ ...x, file, error: reason }))
      return
    }
    const record = result.result as { url?: unknown } | undefined
    const url = typeof record?.url === 'string'
      ? record.url
      : /https:\/\/claude\.ai\/\S*artifact\/[\w-]+/.exec(result.text ?? '')?.[0] ?? s.url
    await update($, state, x => ({
      ...x, url, file, error: null,
      publishCount: x.publishCount + 1,
      lastPublishedAt: now,
      publishedRevision: s.revision,
    }))
    if (url && url !== s.url) {
      await $.store.set(`url:${session}`, url)
      await announceLink($, url, s.url === null)
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await update($, state, x => ({ ...x, error: reason.slice(0, 300) }))
  } finally {
    isPublishing = false
    if (isPending) {
      isPending = false
      schedule($, DELAY_MS)
    }
  }
}

/** Folds requests that arrive close together into one publish. */
function schedule($: $, ms: number) {
  if (timer !== null) return
  timer = $.clock.after(ms, () => { void publish($) })
}

/** Applies a state change and schedules a publish when the cadence asks for one. */
async function change($: $, fn: (s: NavigatorState) => NavigatorState, origin: Origin) {
  let before = INITIAL_STATE
  let after = INITIAL_STATE
  await update($, state, s => {
    before = s
    after = withActivation(fn(s), config)
    return after
  })
  if (publishReason(before, after, config.cadence, origin) !== null) schedule($, DELAY_MS)
  return after
}

// ------------------------------------------------------------ instructions for the model

function instructions(): string {
  const extra = [
    'blocked steps and why',
    'decisions the user needs to make',
    config.sections.requirements && 'requirements covered',
    config.sections.tests && 'tests passing',
    config.sections.pr && 'the PR and its state',
    config.sections.screenshots && 'screenshots of the interface (paths to PNG/JPG files)',
  ].filter(Boolean).join(', ')
  return `# Navigator: progress of long jobs
On long jobs the navigator plugin creates and republishes, on its own, an HTML progress page (an Artifact) with the steps of your plan. Do not create or publish it yourself, and do not ask the user whether they want it.
- It starts when your list of steps (TaskCreate or TodoWrite; if you have neither, the ${TOOL_NAME} tool with \`steps\`) reaches ${config.threshold} steps.
- Group steps into blocks by putting the block name in square brackets at the start of the step title: "[Payments] Migrate the invoices table".
- With ${TOOL_NAME}, give navigator what the list does not know, per block: ${extra}. Call it when any of these changes, usually when a step finishes; report a blocked step or a new decision right away.
- When the plugin hands you the link of the first publish, give it to the user once.`
}

function toolSchema() {
  const block: Record<string, unknown> = {
    name: { type: 'string', description: 'Block name, the same one used in square brackets in the step titles.' },
  }
  if (config.sections.requirements) block.requirements = { type: 'array', items: { type: 'string' }, description: 'IDs or short names of the requirements covered (e.g. "FR-12").' }
  if (config.sections.tests) {
    block.tests = {
      type: 'object',
      properties: { passed: { type: 'integer' }, total: { type: 'integer' }, note: { type: 'string' } },
      required: ['passed', 'total'],
    }
  }
  if (config.sections.pr) {
    block.pr = {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['draft', 'open', 'in_review', 'approved', 'merged', 'closed'] },
        number: { type: 'string' }, url: { type: 'string' }, title: { type: 'string' },
      },
      required: ['state'],
    }
  }
  if (config.sections.screenshots) {
    block.screenshots = {
      type: 'array',
      description: 'Screenshots already saved to files (PNG/JPG/WebP), absolute path or relative to the project. The page shows the last 4.',
      items: { type: 'object', properties: { path: { type: 'string' }, caption: { type: 'string' } }, required: ['path'] },
    }
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', description: 'Short name of the job, 2-4 words (e.g. "Stripe payments").' },
      steps: {
        type: 'array',
        description: 'ONLY if you do not use TaskCreate/TodoWrite: the full list of steps, replacing the previous one.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
            block: { type: 'string' },
          },
          required: ['title', 'status'],
        },
      },
      blocked: {
        type: 'array',
        description: 'The FULL list of blocked steps, replacing the previous one ([] unblocks them all). `step` is the step title or id.',
        items: { type: 'object', properties: { step: { type: 'string' }, reason: { type: 'string' } }, required: ['step', 'reason'] },
      },
      decisions: {
        type: 'array',
        description: 'The FULL list of decisions the user needs to make, replacing the previous one ([] = none).',
        items: {
          type: 'object',
          properties: { question: { type: 'string' }, context: { type: 'string' }, block: { type: 'string' } },
          required: ['question'],
        },
      },
      blocks: {
        type: 'array',
        description: 'Data per block, merged by name with what was given before: a field left out stays as it was.',
        items: { type: 'object', properties: block, required: ['name'] },
      },
    },
  }
}

export const register: Register = (on, options) => {
  config = readConfig(options, null)

  // ------------------------------------------------------------ session

  on('session.start', async ($, e, next) => {
    config = readConfig(options, await readOverride($))
    await $.command.register({
      name: 'navigator',
      description: 'Navigator: state and link; "publish" creates or updates the page now, "off"/"on" for this session.',
      argumentHint: '[publish | off | on]',
    })
    if (config.isEnabled) {
      await $.tool.register({
        name: TOOL,
        description: 'Updates the navigator progress page with what the list of steps does not know: blocked steps, decisions the user needs to make and data per block. Every field is optional.',
        inputSchema: toolSchema(),
        isDeferred: false,
      })
    }
    const s = await read($, state)
    if (s.url === null) {
      const saved = await $.store.get(`url:${await $.session.id()}`)
      if (typeof saved === 'string') await update($, state, x => ({ ...x, url: saved }))
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const s = await read($, state)
    if (!config.isEnabled || s.isOff) return composed
    return { sections: [...composed.sections, { id: 'navigator:instructions', text: instructions(), scope: 'session' as const }] }
  })

  // ------------------------------------------------------------ the list of steps

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || result.deny !== undefined || result.isError === true) return result
    const id = result.result?.task?.id
    if (typeof id === 'string') await change($, s => withTaskCreated(s, id, e.subject), 'list')
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || result.deny !== undefined || result.isError === true) return result
    await change($, s => withTaskUpdated(s, { taskId: e.taskId, subject: e.subject, status: e.status }), 'list')
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || result.deny !== undefined || result.isError === true) return result
    await change($, s => withTodos(s, e.todos), 'list')
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: TOOL_NAME }, async ($, e) => {
    const { tool: _t, tool_use_id: _id, agentId: _a, requestMeta: _m, ...input } = e as Record<string, unknown>
    const after = await change($, s => withToolUpdate(s, input as ToolUpdate), 'tool')
    const steps = after.steps.length
    const text = after.isActive
      ? `Navigator updated (${percent(after.steps)}%, ${steps} steps). It republishes on its own.`
      : after.isOff
        ? 'Data saved; navigator is off for this session.'
        : `Data saved; navigator starts at ${config.threshold} steps (now ${steps}).`
    return { result: text }
  })

  // ------------------------------------------------------------ end of turn

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const s = await read($, state)
      if (s.isActive && !s.isOff && isDirty(s)) schedule($, 0)
    }
    return next(e)
  })

  // ------------------------------------------------------------ /navigator

  on('command.run', { command: 'navigator' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') {
      await update($, state, s => ({ ...s, isOff: true }))
      timer?.cancel()
      timer = null
      return { text: 'Navigator is off for this session. "/navigator on" turns it back on.' }
    }
    if (arg === 'on') {
      await change($, s => ({ ...s, isOff: false }), 'list')
      return { text: 'Navigator is back on for this session.' }
    }
    if (arg === 'publish') {
      if (!config.isEnabled) return { text: 'Navigator is disabled in the settings ("enabled" option or .claude/navigator.json).' }
      await change($, s => ({ ...s, isForced: true, isOff: false }), 'list')
      timer?.cancel()
      timer = null
      schedule($, 0)
      return { text: 'Publishing navigator now.' }
    }
    const s = await read($, state)
    const lines = [
      !config.isEnabled ? 'Disabled in the settings.'
        : s.isOff ? 'Off for this session.'
        : s.isActive ? `Active: ${percent(s.steps)}% (${s.steps.filter(p => p.status === 'done').length}/${s.steps.length} steps).`
        : `Waiting: starts at ${config.threshold} steps (now ${s.steps.length}).`,
      s.url ? `Link: ${s.url}` : s.file ? `Local file: ${s.file}` : 'Not published yet.',
      `Cadence: ${config.cadence}.`,
      s.error ? `Last error: ${s.error}` : '',
    ].filter(Boolean)
    return { text: lines.join('\n') }
  })
}
