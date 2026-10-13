import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { NavigatorAgent, NavigatorState } from '../types'
import type { Config, Origin, ToolUpdate } from './logic'
import {
  INITIAL_STATE,
  asNewJob,
  attentionEvents,
  classifyFailure,
  failureText,
  hashName,
  isDirty,
  percent,
  publishReason,
  readConfig,
  withActivation,
  withHistory,
  withTaskCreated,
  withTaskUpdated,
  withTodos,
  withToolUpdate,
} from './logic'
import { MESSAGES } from './messages'
import { MAX_SHOTS, pageTitle, renderPage } from './page'

const state = atom({ plugin: 'navigator', key: 'state' } as const, INITIAL_STATE)

const TOOL = 'update'
const TOOL_NAME = 'mcp__navigator__update'
const DELAY_MS = 1500
/** Inline (data URI) images in total: only for screenshots outside the project. */
const MAX_INLINE_BYTES = 6 * 1024 * 1024
/** One uploaded screenshot: the Artifact tool takes up to 15 MB per binary file. */
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

type $ = EngineInterface

let options: Readonly<Record<string, unknown>> = {}
let config: Config = readConfig({}, null)
let timer: { cancel: () => void } | null = null
let isPublishing = false
let isPending = false

const msg = () => MESSAGES[config.language]

// ------------------------------------------------------------ settings

async function readOverride($: $): Promise<unknown> {
  try {
    const file = `${await $.session.root()}/.claude/navigator.json`
    return (await $.fs.exists(file)) ? JSON.parse(await $.fs.read(file)) : null
  } catch {
    return null
  }
}

/** Reads the settings again, so an edit to .claude/navigator.json counts without a new session. */
async function refreshConfig($: $) {
  config = readConfig(options, await readOverride($))
}

// ------------------------------------------------------------ publishing

type Images = {
  /** screenshot path → what the page loads */
  images: Record<string, string | null>
  /** every screenshot file the page needs: published path → source */
  files: Record<string, string>
}

/**
 * Screenshots inside the project go up once as files next to the page, named
 * by path and modification time, so a republish sends only new ones. Those
 * outside it (the Artifact tool only takes files from the project) are inlined.
 */
async function prepareImages($: $, s: NavigatorState, root: string): Promise<Images> {
  const out: Images = { images: {}, files: {} }
  if (!config.sections.screenshots) return out
  let inline = 0
  const paths = s.blocks.flatMap(b => (b.screenshots ?? []).slice(-MAX_SHOTS).map(x => x.path))
  for (const path of paths) {
    if (path in out.images) continue
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME[ext]
    if (!mime) { out.images[path] = null; continue }
    try {
      const absolute = path.startsWith('/') ? path : `${root}/${path}`
      const stat = await $.fs.stat(absolute)
      if (stat.kind !== 'file') { out.images[path] = null; continue }
      if (absolute.startsWith(`${root}/`) && !absolute.includes('/../')) {
        if (stat.size > MAX_FILE_BYTES) { out.images[path] = null; continue }
        const name = `shots/${hashName(`${absolute}|${stat.mtimeMs}`)}.${ext}`
        out.images[path] = name
        out.files[name] = absolute
        continue
      }
      const { base64 } = await $.fs.read(absolute, { as: 'bytes' })
      inline += base64.length
      out.images[path] = inline > MAX_INLINE_BYTES ? null : `data:${mime};base64,${base64}`
    } catch {
      out.images[path] = null
    }
  }
  return out
}

async function listAgents($: $): Promise<NavigatorAgent[]> {
  if (!config.detail.agents) return []
  try {
    const all = await $.agent.list()
    return all
      .filter(a => a.status === 'running' || a.status === 'pending' || a.status === 'waiting')
      .map(a => ({ description: a.description, type: a.type }))
  } catch {
    return []
  }
}

async function announceLink($: $, url: string, isFirst: boolean) {
  const text = isFirst ? msg().published(url) : msg().newAddress(url)
  $.ui.toast(text, { timeoutMs: 10000 })
  await $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] } })
  await $.session.append({
    message: {
      type: 'user',
      content: [{
        type: 'text',
        text: `[navigator plugin] ${isFirst ? 'Navigator published' : 'Navigator has a new address'}: ${url}. Give the user this link in your next message, once; no need to repeat it after that. The plugin republishes it at the same address on its own.`,
      }],
    },
  })
}

async function publish($: $): Promise<void> {
  timer = null
  if (isPublishing) { isPending = true; return }
  await refreshConfig($)
  const s = await read($, state)
  if (!s.isActive || s.isOff || s.isPaused || !config.isEnabled) return
  isPublishing = true
  try {
    const root = await $.session.root()
    const session = await $.session.id()
    const folder = `${root}/.claude/navigator`
    const file = `${folder}/${session}.html`
    const project = root.split('/').filter(Boolean).pop() ?? 'project'
    const now = await $.clock.now()
    if (!(await $.fs.exists(`${folder}/.gitignore`))) await $.fs.write(`${folder}/.gitignore`, '*\n')
    const { images, files } = await prepareImages($, s, root)
    const html = renderPage({
      state: s, config, project, now, number: s.publishCount + 1, images,
      agents: await listAgents($),
    })
    await $.fs.write(file, html)

    const tools = await $.tool.list()
    if (!tools.some(t => t.name === 'Artifact')) {
      if (s.file !== file) $.ui.toast(msg().savedLocally(file), { timeoutMs: 10000 })
      await update($, state, x => ({ ...x, file, publishedRevision: s.revision, error: 'Artifact is not available in this session' }))
      return
    }

    const base = {
      tool: 'Artifact' as const,
      action: 'publish' as const,
      file_path: file,
      description: `Progress of "${pageTitle(s, project).replace(/^Navigator /, '')}": steps, blocks and open decisions.`,
    }
    const withFiles = (f: Record<string, string>) => (Object.keys(f).length > 0 ? { files: f } : {})
    const fresh = () => $.tool.call({ ...base, icon: 'chart', ...withFiles(files) })
    let url = s.url
    let uploaded = s.uploaded
    let result
    if (s.url) {
      const missing = Object.fromEntries(Object.entries(files).filter(([k]) => !s.uploaded.includes(k)))
      result = await $.tool.call({ ...base, url: s.url, ...withFiles(missing) })
      if (result.deny === undefined && result.isError === true && classifyFailure(result) === 'gone') {
        // The old address cannot be updated (resumed session, deleted artifact): open a new one.
        url = null
        uploaded = []
        result = await fresh()
      }
    } else {
      result = await fresh()
    }
    if (result.deny !== undefined) {
      // Asking again would only bring the same question back on every turn.
      $.ui.toast(msg().paused, { timeoutMs: 10000 })
      await update($, state, x => ({ ...x, file, isPaused: true, error: result.deny.slice(0, 300) }))
      return
    }
    if (result.isError === true) {
      const reason = failureText(result).slice(0, 300)
      $.ui.toast(msg().failed(reason), { timeoutMs: 8000 })
      await update($, state, x => ({ ...x, file, error: reason }))
      return
    }
    const record = result.result as { url?: unknown } | undefined
    const newUrl = typeof record?.url === 'string'
      ? record.url
      : /https:\/\/claude\.ai\/\S*artifact\/[\w-]+/.exec(result.text ?? '')?.[0] ?? url
    const sent = Object.keys(files)
    await update($, state, x => ({
      ...x, url: newUrl, file, error: null,
      publishCount: x.publishCount + 1,
      lastPublishedAt: now,
      publishedRevision: s.revision,
      uploaded: newUrl === s.url ? [...new Set([...uploaded, ...sent])] : sent,
    }))
    if (newUrl && newUrl !== s.url) {
      await $.store.set(`url:${session}`, newUrl)
      await announceLink($, newUrl, s.url === null)
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

/** A push notification (the phone, when the app is linked) for what needs the user. */
async function notify($: $, before: NavigatorState, after: NavigatorState) {
  if (!config.notify || !after.isActive || after.isOff) return
  const news = attentionEvents(before, after)
  if (news.length === 0) return
  try {
    const tools = await $.tool.list()
    if (!tools.some(t => t.name === 'PushNotification')) return
    const first = news[0]!
    const text = first.kind === 'step_blocked' ? msg().notifyBlocked(first.text) : msg().notifyDecision(first.text)
    const more = news.length > 1 ? ` (+${news.length - 1})` : ''
    await $.tool.call({ tool: 'PushNotification', message: `${text}${more}`.slice(0, 190), status: 'proactive' })
  } catch {
    // A notification that does not go out is not worth a failed hook.
  }
}

/** Applies a state change and schedules a publish when the cadence asks for one. */
async function change($: $, fn: (s: NavigatorState) => NavigatorState, origin: Origin) {
  const now = await $.clock.now()
  let before = INITIAL_STATE
  let after = INITIAL_STATE
  await update($, state, s => {
    before = s
    after = withHistory(s, withActivation(fn(s), config), now)
    return after
  })
  if (publishReason(before, after, config.cadence, origin) !== null && !after.isPaused) schedule($, DELAY_MS)
  await notify($, before, after)
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
      description: 'Screenshots already saved to files (PNG/JPG/WebP), absolute path or relative to the project. The page shows the last 8.',
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

export const register: Register = (on, userOptions) => {
  options = userOptions
  config = readConfig(options, null)

  // ------------------------------------------------------------ session

  on('session.start', async ($, e, next) => {
    await refreshConfig($)
    await $.command.register({
      name: 'navigator',
      description: 'Navigator: state and link; "publish" creates or updates the page now, "link" gives the link, "reset" starts a new job, "off"/"on" for this session.',
      argumentHint: '[publish | link | reset | off | on]',
    })
    if (config.isEnabled) {
      await $.tool.register({
        name: TOOL,
        description: 'Updates the navigator progress page with what the list of steps does not know: blocked steps, decisions the user needs to make and data per block. Every field is optional.',
        inputSchema: toolSchema(),
        isDeferred: false,
      })
    }
    // A state saved by an older version (plugin updated mid-session) gets the new fields.
    await update($, state, x => ({ ...INITIAL_STATE, ...x }))
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
      // What the cadence left unpublished goes out now; a failed publish is retried either way.
      const isDue = config.publishAtTurnEnd || s.error !== null
      if (s.isActive && !s.isOff && !s.isPaused && isDirty(s) && isDue) schedule($, 0)
    }
    return next(e)
  })

  // ------------------------------------------------------------ /navigator

  on('command.run', { command: 'navigator' }, async ($, e) => {
    await refreshConfig($)
    const m = msg()
    const arg = e.args.trim().toLowerCase()
    if (arg === 'off') {
      await update($, state, s => ({ ...s, isOff: true }))
      timer?.cancel()
      timer = null
      return { text: m.off }
    }
    if (arg === 'on') {
      await change($, s => ({ ...s, isOff: false, isPaused: false }), 'list')
      return { text: m.on }
    }
    if (arg === 'publish') {
      if (!config.isEnabled) return { text: m.disabled }
      await change($, s => ({ ...s, isForced: true, isOff: false, isPaused: false }), 'list')
      timer?.cancel()
      timer = null
      schedule($, 0)
      return { text: m.publishing }
    }
    if (arg === 'link') {
      const s = await read($, state)
      return { text: s.url ? s.url : s.file ? m.localFile(s.file) : m.noLink }
    }
    if (arg === 'reset') {
      await change($, s => ({ ...asNewJob(s), revision: s.revision + 1 }), 'list')
      return { text: m.reset }
    }
    if (arg !== '') return { text: m.usage }
    const s = await read($, state)
    const lines = [
      !config.isEnabled ? m.stateDisabled
        : s.isOff ? m.stateOff
        : s.isPaused ? m.statePaused
        : s.isActive ? m.stateActive(percent(s.steps), s.steps.filter(p => p.status === 'done').length, s.steps.length)
        : m.stateWaiting(config.threshold, s.steps.length),
      s.url ? m.link(s.url) : s.file ? m.localFile(s.file) : m.noLink,
      m.cadence(config.cadence, config.publishAtTurnEnd),
      s.error ? m.lastError(s.error) : '',
    ].filter(Boolean)
    return { text: lines.join('\n') }
  })
}
