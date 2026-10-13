// La pagina del navigator: HTML autonomo, pubblicato come Artifact.
// Riepilogo in alto, poi ciò che serve dall'utente, poi i blocchi con i passi.
// Lingua, tema, colori e dettaglio vengono dalla configurazione.

import type { NavigatorPasso, NavigatorStato } from '../types'
import type { ColoreChiave, Config, Gruppo, Lingua, StatoMostrato, Tema } from './logica'
import { COLORI_CHIAVI, fermoDi, percentuale, raggruppa, statoMostrato } from './logica'

export type DatiPagina = {
  stato: NavigatorStato
  config: Pick<Config, 'sezioni' | 'lingua' | 'tema' | 'colori' | 'dettaglio'>
  progetto: string
  ora: number
  numero: number
  /** percorso dello screenshot → data URI, o null se non leggibile */
  immagini: Readonly<Record<string, string | null>>
}

// ---------------------------------------------------------------- testi

const TESTI = {
  en: {
    occhiello: 'Navigator',
    aggiornato: 'Last updated',
    pubblicazione: 'Update no.',
    passiFatti: (f: number, n: number) => `${f} of ${n} steps done`,
    complessivo: 'Overall progress',
    serve: 'Needs you',
    decisioni: 'Decisions to make',
    fermi: 'Blocked steps',
    blocchi: 'Blocks',
    passi: 'Steps',
    altri: 'Other steps',
    nessunPasso: 'No steps assigned to this block.',
    nascosti: (n: number) => (n === 1 ? '1 completed step hidden' : `${n} completed steps hidden`),
    requisiti: 'Requirements',
    test: 'Tests',
    passano: 'passing',
    pr: 'PR',
    screenshot: 'Screenshots',
    immagineMancante: 'Image not readable',
    piede: 'Updated by Claude Code as the work moves. This page refreshes on its own.',
    stati: { da_fare: 'to do', in_corso: 'in progress', fatto: 'done', bloccato: 'blocked' },
    statiPr: { bozza: 'draft', aperta: 'open', 'in revisione': 'in review', approvata: 'approved', fusa: 'merged', chiusa: 'closed' } as Record<string, string>,
    locale: 'en-GB',
  },
  it: {
    occhiello: 'Navigator',
    aggiornato: 'Ultimo aggiornamento',
    pubblicazione: 'Pubblicazione n.',
    passiFatti: (f: number, n: number) => `${f} di ${n} passi fatti`,
    complessivo: 'Avanzamento complessivo',
    serve: 'Serve da te',
    decisioni: 'Decisioni da prendere',
    fermi: 'Passi fermi',
    blocchi: 'Blocchi',
    passi: 'Passi',
    altri: 'Altri passi',
    nessunPasso: 'Nessun passo assegnato a questo blocco.',
    nascosti: (n: number) => (n === 1 ? '1 passo fatto nascosto' : `${n} passi fatti nascosti`),
    requisiti: 'Requisiti',
    test: 'Test',
    passano: 'passano',
    pr: 'PR',
    screenshot: 'Screenshot',
    immagineMancante: 'Immagine non leggibile',
    piede: 'Aggiornato da Claude Code a ogni avanzamento. Questa pagina si rinnova da sola.',
    stati: { da_fare: 'da fare', in_corso: 'in corso', fatto: 'fatto', bloccato: 'bloccato' },
    statiPr: { bozza: 'bozza', aperta: 'aperta', 'in revisione': 'in revisione', approvata: 'approvata', fusa: 'fusa', chiusa: 'chiusa' } as Record<string, string>,
    locale: 'it-IT',
  },
} satisfies Record<Lingua, unknown>

type Testi = (typeof TESTI)[Lingua]

// ---------------------------------------------------------------- temi

type Tavolozza = Record<ColoreChiave | 'tenue' | 'linea', string>

const TEMI: Record<Tema, { chiaro: Tavolozza; scuro: Tavolozza }> = {
  standard: {
    chiaro: { sfondo: '#f3f5f8', superficie: '#ffffff', testo: '#15202b', tenue: '#5a6776', linea: '#dbe1e8', accento: '#1d5fc4', fatto: '#17794a', in_corso: '#a86300', bloccato: '#b3261e', da_fare: '#7b8794', attenzione: '#b3261e' },
    scuro: { sfondo: '#0e1319', superficie: '#151c25', testo: '#e5eaf0', tenue: '#98a5b4', linea: '#253141', accento: '#7eb0ff', fatto: '#4fc58b', in_corso: '#f0b04a', bloccato: '#ff7d74', da_fare: '#7f8c9a', attenzione: '#ff7d74' },
  },
  'alto-contrasto': {
    chiaro: { sfondo: '#ffffff', superficie: '#ffffff', testo: '#000000', tenue: '#333333', linea: '#1a1a1a', accento: '#0040c0', fatto: '#006b2e', in_corso: '#8a4b00', bloccato: '#a00000', da_fare: '#444444', attenzione: '#a00000' },
    scuro: { sfondo: '#000000', superficie: '#0a0a0a', testo: '#ffffff', tenue: '#d0d0d0', linea: '#bdbdbd', accento: '#8cb4ff', fatto: '#5be39a', in_corso: '#ffc35c', bloccato: '#ff8a80', da_fare: '#c4c4c4', attenzione: '#ff8a80' },
  },
  tenue: {
    chiaro: { sfondo: '#f6f5f2', superficie: '#fffefb', testo: '#2b2d31', tenue: '#6e6f73', linea: '#e4e1da', accento: '#4f6d8f', fatto: '#4f8a6b', in_corso: '#a8843a', bloccato: '#b0605a', da_fare: '#999999', attenzione: '#b0605a' },
    scuro: { sfondo: '#1a1b1d', superficie: '#222326', testo: '#e7e5e0', tenue: '#a3a19c', linea: '#34353a', accento: '#9db5d1', fatto: '#86c2a0', in_corso: '#d9b673', bloccato: '#e0948d', da_fare: '#8b8b8b', attenzione: '#e0948d' },
  },
}

const NOME_VAR: Record<keyof Tavolozza, string> = {
  sfondo: '--bg', superficie: '--surface', testo: '--ink', tenue: '--muted', linea: '--line', accento: '--accent',
  fatto: '--ok', in_corso: '--run', bloccato: '--stop', da_fare: '--todo', attenzione: '--attn',
}

/** Il tema scelto con sopra i colori personalizzati, che valgono per il tema chiaro e per lo scuro. */
function variabili(d: DatiPagina['config'], scuro: boolean): string {
  const t: Tavolozza = { ...TEMI[d.tema][scuro ? 'scuro' : 'chiaro'] }
  for (const k of COLORI_CHIAVI) {
    const c = d.colori[k]
    if (c) t[k] = c
  }
  // Un colore di stato personalizzato senza «attenzione» personalizzato la trascina con sé.
  if (!d.colori.attenzione && d.colori.bloccato) t.attenzione = d.colori.bloccato
  return (Object.keys(NOME_VAR) as (keyof Tavolozza)[]).map(k => `${NOME_VAR[k]}: ${t[k]};`).join(' ')
}

// ---------------------------------------------------------------- pezzi

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, c => ESC[c]!)

const TONO_PR: Record<string, StatoMostrato> = {
  bozza: 'da_fare', aperta: 'in_corso', 'in revisione': 'in_corso', approvata: 'fatto', fusa: 'fatto', chiusa: 'bloccato',
}

type Contesto = { s: NavigatorStato; d: DatiPagina; t: Testi }

const pill = (c: Contesto, stato: StatoMostrato) => `<span class="pill s-${stato}">${c.t.stati[stato]}</span>`

const barra = (c: Contesto, pct: number, classe = '') =>
  c.d.config.dettaglio.barre
    ? `<div class="barra ${classe}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`
    : ''

function statoGruppo(s: NavigatorStato, g: Gruppo): StatoMostrato {
  const stati = g.passi.map(p => statoMostrato(s, p))
  if (stati.length === 0) return 'da_fare'
  if (stati.every(x => x === 'fatto')) return 'fatto'
  if (stati.includes('bloccato')) return 'bloccato'
  if (stati.some(x => x === 'in_corso' || x === 'fatto')) return 'in_corso'
  return 'da_fare'
}

function rigaPasso(c: Contesto, p: NavigatorPasso): string {
  const stato = statoMostrato(c.s, p)
  const fermo = stato === 'bloccato' && c.d.config.dettaglio.motiviBlocco ? fermoDi(c.s, p) : undefined
  return `<li class="passo">${pill(c, stato)}<span class="titolo-passo">${esc(p.titolo)}${
    fermo ? `<span class="motivo">${esc(fermo.motivo)}</span>` : ''
  }</span></li>`
}

function datiBlocco(c: Contesto, g: Gruppo): string {
  const d = g.dati
  if (!d) return ''
  const { sezioni, dettaglio } = c.d.config
  const righe: string[] = []
  if (sezioni.requisiti && d.requisiti?.length) {
    righe.push(
      `<div class="riga"><dt>${c.t.requisiti}</dt><dd class="chips">${d.requisiti
        .map(r => `<span class="chip">${esc(r)}</span>`)
        .join('')}</dd></div>`,
    )
  }
  if (sezioni.test && d.test && d.test.totali > 0) {
    const pct = Math.round((d.test.passati / d.test.totali) * 100)
    const classe = d.test.passati === d.test.totali ? 'ok' : 'ko'
    righe.push(
      `<div class="riga"><dt>${c.t.test}</dt><dd><span class="num">${d.test.passati}/${d.test.totali}</span> ${c.t.passano} ${barra(c, pct, `mini ${classe}`)}${
        dettaglio.noteTest && d.test.nota ? `<span class="nota">${esc(d.test.nota)}</span>` : ''
      }</dd></div>`,
    )
  }
  if (sezioni.pr && d.pr) {
    const nome = [d.pr.numero ? `#${String(d.pr.numero).replace(/^#/, '')}` : '', d.pr.titolo ?? '']
      .filter(Boolean)
      .join(' ') || 'Pull request'
    const link = d.pr.url && /^https?:\/\//.test(d.pr.url)
      ? `<a href="${esc(d.pr.url)}" target="_blank" rel="noopener">${esc(nome)}</a>`
      : esc(nome)
    const chiave = d.pr.stato.toLowerCase()
    const tono = TONO_PR[chiave] ?? 'da_fare'
    righe.push(`<div class="riga"><dt>${c.t.pr}</dt><dd>${link} <span class="pill s-${tono}">${esc(c.t.statiPr[chiave] ?? d.pr.stato)}</span></dd></div>`)
  }
  if (sezioni.screenshot && d.screenshot?.length) {
    const figure = d.screenshot
      .slice(-4)
      .map(sc => {
        const src = c.d.immagini[sc.percorso]
        const didascalia = esc(sc.didascalia ?? sc.percorso.split('/').pop())
        return src
          ? `<figure><img src="${src}" alt="${didascalia}" loading="lazy"><figcaption>${didascalia}</figcaption></figure>`
          : `<figure class="mancante"><div>${c.t.immagineMancante}</div><figcaption>${didascalia}</figcaption></figure>`
      })
      .join('')
    righe.push(`<div class="riga riga-shot"><dt>${c.t.screenshot}</dt><dd class="shots">${figure}</dd></div>`)
  }
  return righe.length ? `<dl class="dati">${righe.join('')}</dl>` : ''
}

function sezioneBlocco(c: Contesto, g: Gruppo, soloGruppo: boolean): string {
  const { dettaglio } = c.d.config
  const fatti = g.passi.filter(p => p.stato === 'fatto').length
  const pct = percentuale(g.passi)
  const stato = statoGruppo(c.s, g)
  const nome = g.nome ?? (soloGruppo ? c.t.passi : c.t.altri)
  const visibili = dettaglio.passiFatti ? g.passi : g.passi.filter(p => p.stato !== 'fatto')
  const nascosti = g.passi.length - visibili.length
  const elenco = visibili.length ? `<ol class="passi">${visibili.map(p => rigaPasso(c, p)).join('')}</ol>` : ''
  const passi = g.passi.length === 0
    ? `<p class="vuoto">${c.t.nessunPasso}</p>`
    : elenco + (nascosti > 0 ? `<p class="vuoto">${c.t.nascosti(nascosti)}</p>` : '')
  const aperto = stato !== 'fatto' || !dettaglio.comprimiChiusi ? ' open' : ''
  return `<details class="blocco b-${stato}"${aperto}>
<summary><span class="nome-blocco">${esc(nome)}</span>${pill(c, stato)}<span class="conto num">${fatti}/${g.passi.length}</span>${barra(c, pct, 'mini')}</summary>
<div class="corpo">${passi}${datiBlocco(c, g)}</div>
</details>`
}

function sezioneServe(c: Contesto): string {
  const { s, t } = c
  const { dettaglio } = c.d.config
  const fermi = s.passi
    .filter(p => statoMostrato(s, p) === 'bloccato')
    .map(p => ({ passo: p.titolo, motivo: fermoDi(s, p)!.motivo }))
  const orfani = s.fermi.filter(f => !s.passi.some(p => fermoDi(s, p) === f))
  const tuttiFermi = [...fermi, ...orfani]
  if (s.decisioni.length === 0 && tuttiFermi.length === 0) return ''
  const decisioni = s.decisioni
    .map(
      x => `<li><p class="domanda">${esc(x.domanda)}</p>${
        dettaglio.contestoDecisioni && x.contesto ? `<p class="contesto">${esc(x.contesto)}</p>` : ''
      }${x.blocco ? `<span class="chip">${esc(x.blocco)}</span>` : ''}</li>`,
    )
    .join('')
  const bloccati = tuttiFermi
    .map(f => `<li><p class="domanda">${esc(f.passo)}</p>${
      dettaglio.motiviBlocco ? `<p class="contesto">${esc(f.motivo)}</p>` : ''
    }</li>`)
    .join('')
  return `<section class="serve" aria-labelledby="serve-t">
<h2 id="serve-t">${t.serve}</h2>
<div class="serve-griglia">
${decisioni ? `<div><h3>${t.decisioni} <span class="num">${s.decisioni.length}</span></h3><ul>${decisioni}</ul></div>` : ''}
${bloccati ? `<div><h3>${t.fermi} <span class="num">${tuttiFermi.length}</span></h3><ul>${bloccati}</ul></div>` : ''}
</div>
</section>`
}

const fmtUtc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'

export function titoloPagina(s: NavigatorStato, progetto: string): string {
  return `Navigator ${s.titolo ?? progetto}`
}

export function renderPagina(d: DatiPagina): string {
  const s = d.stato
  const t = TESTI[d.config.lingua]
  const c: Contesto = { s, d, t }
  const pct = percentuale(s.passi)
  const conta = (x: StatoMostrato) => s.passi.filter(p => statoMostrato(s, p) === x).length
  const gruppi = raggruppa(s)
  const fatti = conta('fatto')
  const iso = new Date(d.ora).toISOString()
  const chips = d.config.dettaglio.conteggiStato
    ? `<div class="chips">${(['in_corso', 'bloccato', 'da_fare', 'fatto'] as const)
        .map(x => `<span class="pill s-${x}">${t.stati[x]} <b class="num">${conta(x)}</b></span>`)
        .join('')}</div>`
    : ''
  const scuro = variabili(d.config, true)

  return `<title>${esc(titoloPagina(s, d.progetto))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Quadro di controllo: riepilogo, poi ciò che chiede attenzione, poi i blocchi in colonna. Tema: ${d.config.tema}. */
:root {
  ${variabili(d.config, false)}
  --f-ui: "Instrument Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
  --f-num: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${scuro} color-scheme: dark } }
:root[data-theme="dark"] { ${scuro} color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--bg); color: var(--ink); font: 15px/1.5 var(--f-ui) }
.pagina { max-width: 68rem; margin: 0 auto; padding-inline: 16px; padding-block: 1.5rem 3rem; display: grid; gap: 1.5rem }
.num { font-family: var(--f-num); font-variant-numeric: tabular-nums }
h1, h2, h3 { text-wrap: balance; margin: 0 }
a { color: var(--accent) }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px }
.testa { display: grid; gap: .75rem }
.occhiello { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); font-weight: 600 }
h1 { font-size: clamp(1.5rem, 3.5vw, 2.1rem); font-weight: 700; line-height: 1.15 }
.meta { color: var(--muted); font-size: .875rem; display: flex; flex-wrap: wrap; gap: .25rem 1rem }
.riepilogo { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 1.1rem 1.25rem; display: grid; gap: .8rem }
.cifra { display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap }
.cifra .pct { font-family: var(--f-num); font-size: 2.6rem; font-weight: 600; line-height: 1 }
.cifra .di { color: var(--muted) }
.barra { height: 10px; border-radius: 99px; background: color-mix(in srgb, var(--todo) 22%, transparent); overflow: hidden }
.barra > span { display: block; height: 100%; background: var(--ok); border-radius: inherit }
.barra.mini { height: 6px; width: 7rem; display: inline-block; vertical-align: middle; flex: none }
.barra.ko > span { background: var(--run) }
.chips { display: flex; flex-wrap: wrap; gap: .4rem }
.pill { display: inline-flex; align-items: center; gap: .35rem; font-size: .75rem; font-weight: 600; padding: .12rem .55rem; border-radius: 99px; white-space: nowrap; border: 1px solid transparent }
.pill b { font-weight: 600 }
.s-fatto { color: var(--ok); background: color-mix(in srgb, var(--ok) 13%, transparent) }
.s-in_corso { color: var(--run); background: color-mix(in srgb, var(--run) 14%, transparent) }
.s-bloccato { color: var(--stop); background: color-mix(in srgb, var(--stop) 13%, transparent) }
.s-da_fare { color: var(--todo); border-color: var(--line) }
.chip { font-size: .75rem; padding: .1rem .5rem; border-radius: 6px; background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--ink); font-family: var(--f-num) }
.serve { border: 1px solid color-mix(in srgb, var(--attn) 45%, var(--line)); background: color-mix(in srgb, var(--attn) 6%, var(--surface)); border-radius: 10px; padding: 1.1rem 1.25rem; display: grid; gap: .8rem }
.serve h2 { font-size: 1.1rem; color: var(--attn) }
.serve h3 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: .4rem }
.serve-griglia { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)) }
.serve ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .6rem }
.serve li { min-width: 0; display: grid; gap: .2rem; justify-items: start }
.domanda { margin: 0; font-weight: 600 }
.contesto { margin: 0; color: var(--muted); font-size: .9rem }
.blocchi { display: grid; gap: .75rem }
.blocchi > h2 { font-size: 1.1rem }
.blocco { background: var(--surface); border: 1px solid var(--line); border-radius: 10px }
.blocco.b-bloccato { border-color: color-mix(in srgb, var(--stop) 45%, var(--line)) }
summary { list-style: none; cursor: pointer; display: flex; align-items: center; flex-wrap: wrap; gap: .5rem .75rem; padding: .85rem 1.1rem }
summary::-webkit-details-marker { display: none }
summary::before { content: "▸"; color: var(--muted); transition: transform .15s }
details[open] > summary::before { transform: rotate(90deg) }
.nome-blocco { font-weight: 600; font-size: 1.02rem; min-width: 0; flex: 1 1 12rem }
.conto { color: var(--muted); font-size: .85rem }
.corpo { padding: 0 1.1rem 1rem 2.2rem; display: grid; gap: .9rem; min-width: 0 }
.passi { margin: 0; padding: 0; list-style: none; display: grid; gap: .45rem }
.passo { display: grid; grid-template-columns: 6.4rem 1fr; gap: .6rem; align-items: start }
.passo .pill { justify-content: center }
.titolo-passo { min-width: 0; overflow-wrap: anywhere }
.motivo { display: block; color: var(--stop); font-size: .85rem }
.vuoto { margin: 0; color: var(--muted); font-size: .9rem }
.dati { margin: 0; display: grid; gap: .5rem; border-top: 1px dashed var(--line); padding-top: .8rem }
.riga { display: grid; grid-template-columns: 7rem 1fr; gap: .6rem; align-items: center }
.riga-shot { align-items: start }
dt { font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600 }
dd { margin: 0; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; overflow-wrap: anywhere }
.nota { color: var(--muted); font-size: .85rem; flex-basis: 100% }
.shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); gap: .75rem }
figure { margin: 0; display: grid; gap: .3rem; min-width: 0 }
figure img { width: 100%; max-width: 100%; border: 1px solid var(--line); border-radius: 6px; background: var(--bg) }
figure.mancante div { aspect-ratio: 16/10; max-width: 100%; border: 1px dashed var(--line); border-radius: 6px; display: grid; place-items: center; color: var(--muted); font-size: .8rem }
figcaption { font-size: .8rem; color: var(--muted); overflow-wrap: anywhere }
.piede { color: var(--muted); font-size: .8rem }
@media (max-width: 30rem) { .riga { grid-template-columns: 1fr } .corpo { padding-left: 1.1rem } .barra.mini { width: 5rem } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important } }
</style>
<main class="pagina" lang="${d.config.lingua}">
<header class="testa">
<span class="occhiello">${t.occhiello} · ${esc(d.progetto)}</span>
<h1>${esc(s.titolo ?? d.progetto)}</h1>
<div class="meta"><span>${t.aggiornato}: <time id="agg" datetime="${iso}">${fmtUtc(d.ora)}</time></span><span>${t.pubblicazione} <span class="num">${d.numero}</span></span></div>
</header>
<section class="riepilogo" aria-label="${t.complessivo}">
<div class="cifra"><span class="pct">${pct}%</span><span class="di">${esc(t.passiFatti(fatti, s.passi.length))}</span></div>
${barra(c, pct)}
${chips}
</section>
${sezioneServe(c)}
<section class="blocchi" aria-labelledby="blocchi-t">
<h2 id="blocchi-t">${t.blocchi}</h2>
${gruppi.map(g => sezioneBlocco(c, g, gruppi.length === 1)).join('\n')}
</section>
<p class="piede">${t.piede}</p>
</main>
<script>
(function () {
  try {
    var t = document.getElementById('agg');
    var d = new Date(t.getAttribute('datetime'));
    t.textContent = d.toLocaleString('${t.locale}', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {}
})();
</script>
`
}
