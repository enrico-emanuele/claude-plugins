// The navigator page: standalone HTML, published as an Artifact.
// Summary first, then what needs the user, then the blocks with their steps.
// Language, theme, colours and detail come from the settings.

import type { NavigatorAgent, NavigatorEventKind, NavigatorState, NavigatorStep } from '../types'
import type { ColorKey, Config, Group, Language, ShownStatus, Theme } from './logic'
import { COLOR_KEYS, blockerOf, groupSteps, percent, shownStatus } from './logic'

export type PageData = {
  state: NavigatorState
  config: Pick<Config, 'sections' | 'language' | 'theme' | 'colors' | 'detail'>
  project: string
  now: number
  number: number
  /** screenshot path → what the page loads (a published file or a data URI), or null when it could not be read */
  images: Readonly<Record<string, string | null>>
  /** subagents at work when the page was rendered */
  agents?: readonly NavigatorAgent[]
}

// ---------------------------------------------------------------- texts

const TEXTS = {
  en: {
    eyebrow: 'Navigator',
    updated: 'Last updated',
    update: 'Update no.',
    stepsDone: (done: number, all: number) => `${done} of ${all} steps done`,
    overall: 'Overall progress',
    needsYou: 'Needs you',
    decisions: 'Decisions to make',
    blocked: 'Blocked steps',
    blocks: 'Blocks',
    steps: 'Steps',
    otherSteps: 'Other steps',
    noSteps: 'No steps assigned to this block.',
    hidden: (n: number) => (n === 1 ? '1 completed step hidden' : `${n} completed steps hidden`),
    requirements: 'Requirements',
    tests: 'Tests',
    passing: 'passing',
    pr: 'PR',
    screenshots: 'Screenshots',
    missingImage: 'Image not readable',
    footer: 'Claude Code republishes this page at the same address as the work moves. Reload it to see the latest version.',
    started: 'Started',
    elapsed: 'running for',
    since: 'for',
    agents: (n: number) => (n === 1 ? '1 agent at work' : `${n} agents at work`),
    events: 'Recent events',
    eventKind: {
      job_started: 'Job started', step_done: 'Step done', step_blocked: 'Step blocked', step_unblocked: 'Step unblocked',
      decision_opened: 'Decision to make', decision_closed: 'Decision made', block_done: 'Block done', job_done: 'Job done',
    } satisfies Record<NavigatorEventKind, string>,
    units: { day: 'd', hour: 'h', minute: 'min', underMinute: '<1 min' },
    status: { todo: 'to do', in_progress: 'in progress', done: 'done', blocked: 'blocked' },
    prState: { draft: 'draft', open: 'open', in_review: 'in review', approved: 'approved', merged: 'merged', closed: 'closed' } as Record<string, string>,
    locale: 'en-GB',
  },
  it: {
    eyebrow: 'Navigator',
    updated: 'Ultimo aggiornamento',
    update: 'Pubblicazione n.',
    stepsDone: (done: number, all: number) => `${done} di ${all} passi fatti`,
    overall: 'Avanzamento complessivo',
    needsYou: 'Serve da te',
    decisions: 'Decisioni da prendere',
    blocked: 'Passi fermi',
    blocks: 'Blocchi',
    steps: 'Passi',
    otherSteps: 'Altri passi',
    noSteps: 'Nessun passo assegnato a questo blocco.',
    hidden: (n: number) => (n === 1 ? '1 passo fatto nascosto' : `${n} passi fatti nascosti`),
    requirements: 'Requisiti',
    tests: 'Test',
    passing: 'passano',
    pr: 'PR',
    screenshots: 'Screenshot',
    missingImage: 'Immagine non leggibile',
    footer: 'Claude Code ripubblica questa pagina allo stesso indirizzo a ogni avanzamento. Ricaricala per vedere l\'ultima versione.',
    started: 'Iniziato',
    elapsed: 'in corso da',
    since: 'da',
    agents: (n: number) => (n === 1 ? '1 agente al lavoro' : `${n} agenti al lavoro`),
    events: 'Ultimi eventi',
    eventKind: {
      job_started: 'Lavoro iniziato', step_done: 'Passo fatto', step_blocked: 'Passo fermo', step_unblocked: 'Passo sbloccato',
      decision_opened: 'Decisione da prendere', decision_closed: 'Decisione presa', block_done: 'Blocco finito', job_done: 'Lavoro finito',
    } satisfies Record<NavigatorEventKind, string>,
    units: { day: 'g', hour: 'h', minute: 'min', underMinute: '<1 min' },
    status: { todo: 'da fare', in_progress: 'in corso', done: 'fatto', blocked: 'bloccato' },
    prState: { draft: 'bozza', open: 'aperta', in_review: 'in revisione', approved: 'approvata', merged: 'fusa', closed: 'chiusa' } as Record<string, string>,
    locale: 'it-IT',
  },
} satisfies Record<Language, unknown>

type Texts = (typeof TEXTS)[Language]

// ---------------------------------------------------------------- themes

type Palette = Record<ColorKey | 'muted' | 'line', string>

const THEMES: Record<Theme, { light: Palette; dark: Palette }> = {
  standard: {
    light: { background: '#f3f5f8', surface: '#ffffff', text: '#15202b', muted: '#5a6776', line: '#dbe1e8', accent: '#1d5fc4', done: '#17794a', in_progress: '#a86300', blocked: '#b3261e', todo: '#7b8794', attention: '#b3261e' },
    dark: { background: '#0e1319', surface: '#151c25', text: '#e5eaf0', muted: '#98a5b4', line: '#253141', accent: '#7eb0ff', done: '#4fc58b', in_progress: '#f0b04a', blocked: '#ff7d74', todo: '#7f8c9a', attention: '#ff7d74' },
  },
  'high-contrast': {
    light: { background: '#ffffff', surface: '#ffffff', text: '#000000', muted: '#333333', line: '#1a1a1a', accent: '#0040c0', done: '#006b2e', in_progress: '#8a4b00', blocked: '#a00000', todo: '#444444', attention: '#a00000' },
    dark: { background: '#000000', surface: '#0a0a0a', text: '#ffffff', muted: '#d0d0d0', line: '#bdbdbd', accent: '#8cb4ff', done: '#5be39a', in_progress: '#ffc35c', blocked: '#ff8a80', todo: '#c4c4c4', attention: '#ff8a80' },
  },
  muted: {
    light: { background: '#f6f5f2', surface: '#fffefb', text: '#2b2d31', muted: '#6e6f73', line: '#e4e1da', accent: '#4f6d8f', done: '#4f8a6b', in_progress: '#a8843a', blocked: '#b0605a', todo: '#999999', attention: '#b0605a' },
    dark: { background: '#1a1b1d', surface: '#222326', text: '#e7e5e0', muted: '#a3a19c', line: '#34353a', accent: '#9db5d1', done: '#86c2a0', in_progress: '#d9b673', blocked: '#e0948d', todo: '#8b8b8b', attention: '#e0948d' },
  },
}

const CSS_VAR: Record<keyof Palette, string> = {
  background: '--bg', surface: '--surface', text: '--ink', muted: '--muted', line: '--line', accent: '--accent',
  done: '--ok', in_progress: '--run', blocked: '--stop', todo: '--todo', attention: '--attn',
}

/** The chosen theme with the custom colours on top; those apply to light and dark alike. */
function cssVars(c: PageData['config'], isDark: boolean): string {
  const p: Palette = { ...THEMES[c.theme][isDark ? 'dark' : 'light'] }
  for (const k of COLOR_KEYS) {
    const v = c.colors[k]
    if (v) p[k] = v
  }
  // A custom "blocked" colour with no custom "attention" carries it along.
  if (!c.colors.attention && c.colors.blocked) p.attention = c.colors.blocked
  return (Object.keys(CSS_VAR) as (keyof Palette)[]).map(k => `${CSS_VAR[k]}: ${p[k]};`).join(' ')
}

// ---------------------------------------------------------------- parts

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, ch => ESC[ch]!)

/** Screenshots shown per block, the latest ones. */
export const MAX_SHOTS = 8

const PR_TONE: Record<string, ShownStatus> = {
  draft: 'todo', open: 'in_progress', in_review: 'in_progress', approved: 'done', merged: 'done', closed: 'blocked',
}

type Ctx = { s: NavigatorState; d: PageData; t: Texts }

/** "2 h 05 min": the client script below keeps the same format. */
export function duration(ms: number, u: Texts['units']): string {
  const m = Math.floor(Math.max(0, ms) / 60000)
  if (m < 1) return u.underMinute
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const min = m % 60
  if (d > 0) return `${d} ${u.day} ${h} ${u.hour}`
  if (h > 0) return `${h} ${u.hour} ${String(min).padStart(2, '0')} ${u.minute}`
  return `${min} ${u.minute}`
}

/** Time elapsed since `since`, kept current by the page's script. */
const ago = (c: Ctx, since: number | undefined, prefix: string) =>
  c.d.config.detail.times && since !== undefined && since <= c.d.now
    ? `<span class="ago">${esc(prefix)} <time data-since="${since}">${duration(c.d.now - since, c.t.units)}</time></span>`
    : ''

const pill = (c: Ctx, status: ShownStatus) => `<span class="pill s-${status}">${c.t.status[status]}</span>`

const bar = (c: Ctx, pct: number, cls = '') =>
  c.d.config.detail.progressBars
    ? `<div class="bar ${cls}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`
    : ''

function groupStatus(s: NavigatorState, g: Group): ShownStatus {
  const all = g.steps.map(p => shownStatus(s, p))
  if (all.length === 0) return 'todo'
  if (all.every(x => x === 'done')) return 'done'
  if (all.includes('blocked')) return 'blocked'
  if (all.some(x => x === 'in_progress' || x === 'done')) return 'in_progress'
  return 'todo'
}

function stepRow(c: Ctx, p: NavigatorStep): string {
  const status = shownStatus(c.s, p)
  const blocker = status === 'blocked' ? blockerOf(c.s, p) : undefined
  const reason = blocker && c.d.config.detail.blockReasons ? `<span class="reason">${esc(blocker.reason)}</span>` : ''
  const since = status === 'blocked' ? ago(c, blocker?.since, c.t.since) : status === 'in_progress' ? ago(c, p.since, c.t.since) : ''
  return `<li class="step">${pill(c, status)}<span class="step-title">${esc(p.title)}${since}${reason}</span></li>`
}

function blockData(c: Ctx, g: Group): string {
  const b = g.data
  if (!b) return ''
  const { sections, detail } = c.d.config
  const rows: string[] = []
  if (sections.requirements && b.requirements?.length) {
    rows.push(
      `<div class="row"><dt>${c.t.requirements}</dt><dd class="chips">${b.requirements
        .map(r => `<span class="chip">${esc(r)}</span>`)
        .join('')}</dd></div>`,
    )
  }
  if (sections.tests && b.tests && b.tests.total > 0) {
    const pct = Math.round((b.tests.passed / b.tests.total) * 100)
    const cls = b.tests.passed === b.tests.total ? 'ok' : 'ko'
    rows.push(
      `<div class="row"><dt>${c.t.tests}</dt><dd><span class="num">${b.tests.passed}/${b.tests.total}</span> ${c.t.passing} ${bar(c, pct, `mini ${cls}`)}${
        detail.testNotes && b.tests.note ? `<span class="note">${esc(b.tests.note)}</span>` : ''
      }</dd></div>`,
    )
  }
  if (sections.pr && b.pr) {
    const name = [b.pr.number ? `#${String(b.pr.number).replace(/^#/, '')}` : '', b.pr.title ?? '']
      .filter(Boolean)
      .join(' ') || 'Pull request'
    const link = b.pr.url && /^https?:\/\//.test(b.pr.url)
      ? `<a href="${esc(b.pr.url)}" target="_blank" rel="noopener">${esc(name)}</a>`
      : esc(name)
    const key = b.pr.state.toLowerCase().replace(/\s+/g, '_')
    const tone = PR_TONE[key] ?? 'todo'
    rows.push(`<div class="row"><dt>${c.t.pr}</dt><dd>${link} <span class="pill s-${tone}">${esc(c.t.prState[key] ?? b.pr.state)}</span></dd></div>`)
  }
  if (sections.screenshots && b.screenshots?.length) {
    const figures = b.screenshots
      .slice(-MAX_SHOTS)
      .map(sc => {
        const src = c.d.images[sc.path]
        const caption = esc(sc.caption ?? sc.path.split('/').pop())
        return src
          ? `<figure><img src="${src}" alt="${caption}" loading="lazy"><figcaption>${caption}</figcaption></figure>`
          : `<figure class="missing"><div>${c.t.missingImage}</div><figcaption>${caption}</figcaption></figure>`
      })
      .join('')
    rows.push(`<div class="row row-shots"><dt>${c.t.screenshots}</dt><dd class="shots">${figures}</dd></div>`)
  }
  return rows.length ? `<dl class="data">${rows.join('')}</dl>` : ''
}

function blockSection(c: Ctx, g: Group, isOnlyGroup: boolean): string {
  const { detail } = c.d.config
  const done = g.steps.filter(p => p.status === 'done').length
  const pct = percent(g.steps)
  const status = groupStatus(c.s, g)
  const name = g.name ?? (isOnlyGroup ? c.t.steps : c.t.otherSteps)
  const visible = detail.doneSteps ? g.steps : g.steps.filter(p => p.status !== 'done')
  const hidden = g.steps.length - visible.length
  const list = visible.length ? `<ol class="steps">${visible.map(p => stepRow(c, p)).join('')}</ol>` : ''
  const steps = g.steps.length === 0
    ? `<p class="empty">${c.t.noSteps}</p>`
    : list + (hidden > 0 ? `<p class="empty">${c.t.hidden(hidden)}</p>` : '')
  const open = status !== 'done' || !detail.collapseDoneBlocks ? ' open' : ''
  return `<details class="block b-${status}"${open}>
<summary><span class="block-name">${esc(name)}</span>${pill(c, status)}<span class="count num">${done}/${g.steps.length}</span>${bar(c, pct, 'mini')}</summary>
<div class="body">${steps}${blockData(c, g)}</div>
</details>`
}

function needsYouSection(c: Ctx): string {
  const { s, t } = c
  const { detail } = c.d.config
  const onSteps = s.steps
    .filter(p => shownStatus(s, p) === 'blocked')
    .map(p => ({ step: p.title, reason: blockerOf(s, p)!.reason }))
  const orphans = s.blockers.filter(f => !s.steps.some(p => blockerOf(s, p) === f))
  const blockers = [...onSteps, ...orphans]
  if (s.decisions.length === 0 && blockers.length === 0) return ''
  const decisions = s.decisions
    .map(
      x => `<li><p class="question">${esc(x.question)}</p>${
        detail.decisionContext && x.context ? `<p class="context">${esc(x.context)}</p>` : ''
      }${x.block ? `<span class="chip">${esc(x.block)}</span>` : ''}</li>`,
    )
    .join('')
  const blocked = blockers
    .map(f => `<li><p class="question">${esc(f.step)}</p>${
      detail.blockReasons ? `<p class="context">${esc(f.reason)}</p>` : ''
    }</li>`)
    .join('')
  return `<section class="needs" aria-labelledby="needs-t">
<h2 id="needs-t">${t.needsYou}</h2>
<div class="needs-grid">
${decisions ? `<div><h3>${t.decisions} <span class="num">${s.decisions.length}</span></h3><ul>${decisions}</ul></div>` : ''}
${blocked ? `<div><h3>${t.blocked} <span class="num">${blockers.length}</span></h3><ul>${blocked}</ul></div>` : ''}
</div>
</section>`
}

function agentsSection(c: Ctx): string {
  const agents = c.d.agents ?? []
  if (!c.d.config.detail.agents || agents.length === 0) return ''
  return `<section class="agents" aria-label="${esc(c.t.agents(agents.length))}">
<h2>${esc(c.t.agents(agents.length))}</h2>
<ul>${agents.map(a => `<li><span class="pill s-in_progress">${esc(a.type)}</span> ${esc(a.description)}</li>`).join('')}</ul>
</section>`
}

function eventsSection(c: Ctx): string {
  if (!c.d.config.detail.events || c.s.events.length === 0) return ''
  const rows = [...c.s.events].reverse().map(x =>
    `<li><time class="num" datetime="${new Date(x.at).toISOString()}" data-clock>${fmtUtc(x.at).slice(11)}</time><span class="kind k-${x.kind}">${c.t.eventKind[x.kind]}</span><span class="what">${esc(x.text)}</span></li>`)
  return `<section class="events" aria-labelledby="events-t">
<h2 id="events-t">${c.t.events}</h2>
<ol>${rows.join('')}</ol>
</section>`
}

const fmtUtc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'

export function pageTitle(s: NavigatorState, project: string): string {
  return `Navigator ${s.title ?? project}`
}

export function renderPage(d: PageData): string {
  const s = d.state
  const t = TEXTS[d.config.language]
  const c: Ctx = { s, d, t }
  const pct = percent(s.steps)
  const count = (x: ShownStatus) => s.steps.filter(p => shownStatus(s, p) === x).length
  const groups = groupSteps(s)
  const done = count('done')
  const iso = new Date(d.now).toISOString()
  const chips = d.config.detail.statusCounts
    ? `<div class="chips">${(['in_progress', 'blocked', 'todo', 'done'] as const)
        .map(x => `<span class="pill s-${x}">${t.status[x]} <b class="num">${count(x)}</b></span>`)
        .join('')}</div>`
    : ''
  const dark = cssVars(d.config, true)

  return `<title>${esc(pageTitle(s, d.project))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Control board: summary, then what needs attention, then the blocks in one column. Theme: ${d.config.theme}. */
:root {
  ${cssVars(d.config, false)}
  --f-ui: "Instrument Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
  --f-num: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} color-scheme: dark } }
:root[data-theme="dark"] { ${dark} color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--bg); color: var(--ink); font: 15px/1.5 var(--f-ui) }
.page { max-width: 68rem; margin: 0 auto; padding-inline: 16px; padding-block: 1.5rem 3rem; display: grid; gap: 1.5rem }
.num { font-family: var(--f-num); font-variant-numeric: tabular-nums }
h1, h2, h3 { text-wrap: balance; margin: 0 }
a { color: var(--accent) }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px }
.head { display: grid; gap: .75rem }
.eyebrow { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); font-weight: 600 }
h1 { font-size: clamp(1.5rem, 3.5vw, 2.1rem); font-weight: 700; line-height: 1.15 }
.meta { color: var(--muted); font-size: .875rem; display: flex; flex-wrap: wrap; gap: .25rem 1rem }
.summary { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 1.1rem 1.25rem; display: grid; gap: .8rem }
.figure { display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap }
.figure .pct { font-family: var(--f-num); font-size: 2.6rem; font-weight: 600; line-height: 1 }
.figure .of { color: var(--muted) }
.bar { height: 10px; border-radius: 99px; background: color-mix(in srgb, var(--todo) 22%, transparent); overflow: hidden }
.bar > span { display: block; height: 100%; background: var(--ok); border-radius: inherit }
.bar.mini { height: 6px; width: 7rem; display: inline-block; vertical-align: middle; flex: none }
.bar.ko > span { background: var(--run) }
.chips { display: flex; flex-wrap: wrap; gap: .4rem }
.pill { display: inline-flex; align-items: center; gap: .35rem; font-size: .75rem; font-weight: 600; padding: .12rem .55rem; border-radius: 99px; white-space: nowrap; border: 1px solid transparent }
.pill b { font-weight: 600 }
.s-done { color: var(--ok); background: color-mix(in srgb, var(--ok) 13%, transparent) }
.s-in_progress { color: var(--run); background: color-mix(in srgb, var(--run) 14%, transparent) }
.s-blocked { color: var(--stop); background: color-mix(in srgb, var(--stop) 13%, transparent) }
.s-todo { color: var(--todo); border-color: var(--line) }
.chip { font-size: .75rem; padding: .1rem .5rem; border-radius: 6px; background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--ink); font-family: var(--f-num) }
.needs { border: 1px solid color-mix(in srgb, var(--attn) 45%, var(--line)); background: color-mix(in srgb, var(--attn) 6%, var(--surface)); border-radius: 10px; padding: 1.1rem 1.25rem; display: grid; gap: .8rem }
.needs h2 { font-size: 1.1rem; color: var(--attn) }
.needs h3 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: .4rem }
.needs-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)) }
.needs ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .6rem }
.needs li { min-width: 0; display: grid; gap: .2rem; justify-items: start }
.question { margin: 0; font-weight: 600 }
.context { margin: 0; color: var(--muted); font-size: .9rem }
.blocks { display: grid; gap: .75rem }
.blocks > h2 { font-size: 1.1rem }
.block { background: var(--surface); border: 1px solid var(--line); border-radius: 10px }
.block.b-blocked { border-color: color-mix(in srgb, var(--stop) 45%, var(--line)) }
summary { list-style: none; cursor: pointer; display: flex; align-items: center; flex-wrap: wrap; gap: .5rem .75rem; padding: .85rem 1.1rem }
summary::-webkit-details-marker { display: none }
summary::before { content: "▸"; color: var(--muted); transition: transform .15s }
details[open] > summary::before { transform: rotate(90deg) }
.block-name { font-weight: 600; font-size: 1.02rem; min-width: 0; flex: 1 1 12rem }
.count { color: var(--muted); font-size: .85rem }
.body { padding: 0 1.1rem 1rem 2.2rem; display: grid; gap: .9rem; min-width: 0 }
.steps { margin: 0; padding: 0; list-style: none; display: grid; gap: .45rem }
.step { display: grid; grid-template-columns: 6.4rem 1fr; gap: .6rem; align-items: start }
.step .pill { justify-content: center }
.step-title { min-width: 0; overflow-wrap: anywhere }
.reason { display: block; color: var(--stop); font-size: .85rem }
.empty { margin: 0; color: var(--muted); font-size: .9rem }
.data { margin: 0; display: grid; gap: .5rem; border-top: 1px dashed var(--line); padding-top: .8rem }
.row { display: grid; grid-template-columns: 7rem 1fr; gap: .6rem; align-items: center }
.row-shots { align-items: start }
dt { font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600 }
dd { margin: 0; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; overflow-wrap: anywhere }
.note { color: var(--muted); font-size: .85rem; flex-basis: 100% }
.shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); gap: .75rem }
figure { margin: 0; display: grid; gap: .3rem; min-width: 0 }
figure img { width: 100%; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; background: var(--bg) }
figure.missing div { aspect-ratio: 16/10; max-width: 100%; border: 1px dashed var(--line); border-radius: 6px; display: grid; place-items: center; color: var(--muted); font-size: .8rem }
figcaption { font-size: .8rem; color: var(--muted); overflow-wrap: anywhere }
.ago { color: var(--muted); font-size: .8rem; margin-left: .5rem; white-space: nowrap }
.agents, .events { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 1.1rem 1.25rem; display: grid; gap: .6rem }
.agents h2, .events h2 { font-size: 1.1rem }
.agents ul, .events ol { list-style: none; margin: 0; padding: 0; display: grid; gap: .45rem }
.agents li { min-width: 0; overflow-wrap: anywhere }
.events li { display: grid; grid-template-columns: 4.5rem 10rem 1fr; gap: .6rem; align-items: baseline; min-width: 0 }
.events time { color: var(--muted); font-size: .8rem }
.events .kind { font-size: .8rem; font-weight: 600; color: var(--muted) }
.events .k-step_done, .events .k-block_done, .events .k-job_done, .events .k-decision_closed { color: var(--ok) }
.events .k-step_blocked, .events .k-decision_opened { color: var(--attn) }
.events .what { min-width: 0; overflow-wrap: anywhere }
.foot { color: var(--muted); font-size: .8rem }
@media (max-width: 30rem) { .events li { grid-template-columns: 4.5rem 1fr } .events .what { grid-column: 2 } .row { grid-template-columns: 1fr } .body { padding-left: 1.1rem } .bar.mini { width: 5rem } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important } }
</style>
<main class="page" lang="${d.config.language}">
<header class="head">
<span class="eyebrow">${t.eyebrow} · ${esc(d.project)}</span>
<h1>${esc(s.title ?? d.project)}</h1>
<div class="meta"><span>${t.updated}: <time id="updated" datetime="${iso}">${fmtUtc(d.now)}</time></span><span>${t.update} <span class="num">${d.number}</span></span>${
  d.config.detail.times && s.startedAt !== null
    ? `<span>${t.started}: <time datetime="${new Date(s.startedAt).toISOString()}" data-clock>${fmtUtc(s.startedAt)}</time>${
        percent(s.steps) < 100 ? ` · ${ago(c, s.startedAt, t.elapsed)}` : ''
      }</span>`
    : ''
}</div>
</header>
<section class="summary" aria-label="${t.overall}">
<div class="figure"><span class="pct">${pct}%</span><span class="of">${esc(t.stepsDone(done, s.steps.length))}</span></div>
${bar(c, pct)}
${chips}
</section>
${needsYouSection(c)}
${agentsSection(c)}
<section class="blocks" aria-labelledby="blocks-t">
<h2 id="blocks-t">${t.blocks}</h2>
${groups.map(g => blockSection(c, g, groups.length === 1)).join('\n')}
</section>
${eventsSection(c)}
<p class="foot">${t.footer}</p>
</main>
<script>
(function () {
  var locale = '${t.locale}';
  var u = ${JSON.stringify(t.units)};
  try {
    var el = document.getElementById('updated');
    var d = new Date(el.getAttribute('datetime'));
    el.textContent = d.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.querySelectorAll('time[data-clock]').forEach(function (x) {
      var at = new Date(x.getAttribute('datetime'));
      var sameDay = at.toDateString() === new Date().toDateString();
      x.textContent = at.toLocaleString(locale, sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    });
  } catch (e) {}
  // Same format as duration() in page.ts.
  function duration(ms) {
    var m = Math.floor(Math.max(0, ms) / 60000);
    if (m < 1) return u.underMinute;
    var dd = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
    if (dd > 0) return dd + ' ' + u.day + ' ' + h + ' ' + u.hour;
    if (h > 0) return h + ' ' + u.hour + ' ' + (min < 10 ? '0' : '') + min + ' ' + u.minute;
    return min + ' ' + u.minute;
  }
  function tick() {
    document.querySelectorAll('time[data-since]').forEach(function (x) {
      x.textContent = duration(Date.now() - Number(x.getAttribute('data-since')));
    });
  }
  try { tick(); setInterval(tick, 30000); } catch (e) {}
})();
</script>
`
}
