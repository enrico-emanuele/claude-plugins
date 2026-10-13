// La pagina del navigator: HTML autonomo, pubblicato come Artifact.
// Riepilogo in alto, poi ciò che serve dall'utente, poi i blocchi con i passi.

import type { NavigatorPasso, NavigatorStato } from '../types'
import type { Gruppo, Sezioni, StatoMostrato } from './logica'
import { fermoDi, percentuale, raggruppa, statoMostrato } from './logica'

export type DatiPagina = {
  stato: NavigatorStato
  sezioni: Sezioni
  progetto: string
  ora: number
  numero: number
  /** percorso dello screenshot → data URI, o null se non leggibile */
  immagini: Readonly<Record<string, string | null>>
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"']/g, c => ESC[c]!)

const ETICHETTA: Record<StatoMostrato, string> = {
  da_fare: 'da fare',
  in_corso: 'in corso',
  fatto: 'fatto',
  bloccato: 'bloccato',
}

const pill = (stato: StatoMostrato) => `<span class="pill s-${stato}">${ETICHETTA[stato]}</span>`

const barra = (pct: number, classe = '') =>
  `<div class="barra ${classe}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`

const STATO_PR: Record<string, string> = {
  bozza: 'da_fare',
  aperta: 'in_corso',
  'in revisione': 'in_corso',
  approvata: 'fatto',
  fusa: 'fatto',
  chiusa: 'bloccato',
}

function statoGruppo(s: NavigatorStato, g: Gruppo): StatoMostrato {
  const stati = g.passi.map(p => statoMostrato(s, p))
  if (stati.length === 0) return 'da_fare'
  if (stati.every(x => x === 'fatto')) return 'fatto'
  if (stati.includes('bloccato')) return 'bloccato'
  if (stati.some(x => x === 'in_corso' || x === 'fatto')) return 'in_corso'
  return 'da_fare'
}

function rigaPasso(s: NavigatorStato, p: NavigatorPasso): string {
  const stato = statoMostrato(s, p)
  const fermo = stato === 'bloccato' ? fermoDi(s, p) : undefined
  return `<li class="passo">${pill(stato)}<span class="titolo-passo">${esc(p.titolo)}${
    fermo ? `<span class="motivo">${esc(fermo.motivo)}</span>` : ''
  }</span></li>`
}

function datiBlocco(d: Gruppo['dati'], sezioni: Sezioni, immagini: DatiPagina['immagini']): string {
  if (!d) return ''
  const righe: string[] = []
  if (sezioni.requisiti && d.requisiti?.length) {
    righe.push(
      `<div class="riga"><dt>Requisiti</dt><dd class="chips">${d.requisiti
        .map(r => `<span class="chip">${esc(r)}</span>`)
        .join('')}</dd></div>`,
    )
  }
  if (sezioni.test && d.test && d.test.totali > 0) {
    const pct = Math.round((d.test.passati / d.test.totali) * 100)
    const classe = d.test.passati === d.test.totali ? 'ok' : 'ko'
    righe.push(
      `<div class="riga"><dt>Test</dt><dd><span class="num">${d.test.passati}/${d.test.totali}</span> passano ${barra(pct, `mini ${classe}`)}${
        d.test.nota ? `<span class="nota">${esc(d.test.nota)}</span>` : ''
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
    const tono = STATO_PR[d.pr.stato.toLowerCase()] ?? 'da_fare'
    righe.push(`<div class="riga"><dt>PR</dt><dd>${link} <span class="pill s-${tono}">${esc(d.pr.stato)}</span></dd></div>`)
  }
  if (sezioni.screenshot && d.screenshot?.length) {
    const figure = d.screenshot
      .slice(-4)
      .map(sc => {
        const src = immagini[sc.percorso]
        const didascalia = esc(sc.didascalia ?? sc.percorso.split('/').pop())
        return src
          ? `<figure><img src="${src}" alt="${didascalia}" loading="lazy"><figcaption>${didascalia}</figcaption></figure>`
          : `<figure class="mancante"><div>Immagine non leggibile</div><figcaption>${didascalia}</figcaption></figure>`
      })
      .join('')
    righe.push(`<div class="riga riga-shot"><dt>Screenshot</dt><dd class="shots">${figure}</dd></div>`)
  }
  return righe.length ? `<dl class="dati">${righe.join('')}</dl>` : ''
}

function sezioneBlocco(s: NavigatorStato, g: Gruppo, d: DatiPagina, soloGruppo: boolean): string {
  const fatti = g.passi.filter(p => p.stato === 'fatto').length
  const pct = percentuale(g.passi)
  const stato = statoGruppo(s, g)
  const nome = g.nome ?? (soloGruppo ? 'Passi' : 'Altri passi')
  const passi = g.passi.length
    ? `<ol class="passi">${g.passi.map(p => rigaPasso(s, p)).join('')}</ol>`
    : '<p class="vuoto">Nessun passo assegnato a questo blocco.</p>'
  const aperto = stato !== 'fatto' ? ' open' : ''
  return `<details class="blocco b-${stato}"${aperto}>
<summary><span class="nome-blocco">${esc(nome)}</span>${pill(stato)}<span class="conto num">${fatti}/${g.passi.length}</span>${barra(pct, 'mini')}</summary>
<div class="corpo">${passi}${datiBlocco(g.dati, d.sezioni, d.immagini)}</div>
</details>`
}

function sezioneServe(s: NavigatorStato): string {
  const fermi = s.passi
    .filter(p => statoMostrato(s, p) === 'bloccato')
    .map(p => ({ passo: p.titolo, motivo: fermoDi(s, p)!.motivo }))
  const orfani = s.fermi.filter(f => !s.passi.some(p => fermoDi(s, p) === f))
  const tuttiFermi = [...fermi, ...orfani]
  if (s.decisioni.length === 0 && tuttiFermi.length === 0) return ''
  const decisioni = s.decisioni
    .map(
      x => `<li><p class="domanda">${esc(x.domanda)}</p>${
        x.contesto ? `<p class="contesto">${esc(x.contesto)}</p>` : ''
      }${x.blocco ? `<span class="chip">${esc(x.blocco)}</span>` : ''}</li>`,
    )
    .join('')
  const bloccati = tuttiFermi
    .map(f => `<li><p class="domanda">${esc(f.passo)}</p><p class="contesto">${esc(f.motivo)}</p></li>`)
    .join('')
  return `<section class="serve" aria-labelledby="serve-t">
<h2 id="serve-t">Serve da te</h2>
<div class="serve-griglia">
${decisioni ? `<div><h3>Decisioni da prendere <span class="num">${s.decisioni.length}</span></h3><ul>${decisioni}</ul></div>` : ''}
${bloccati ? `<div><h3>Passi fermi <span class="num">${tuttiFermi.length}</span></h3><ul>${bloccati}</ul></div>` : ''}
</div>
</section>`
}

const fmtUtc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'

export function titoloPagina(s: NavigatorStato, progetto: string): string {
  return `Navigator ${s.titolo ?? progetto}`
}

export function renderPagina(d: DatiPagina): string {
  const s = d.stato
  const pct = percentuale(s.passi)
  const conta = (x: StatoMostrato) => s.passi.filter(p => statoMostrato(s, p) === x).length
  const gruppi = raggruppa(s)
  const fatti = conta('fatto')
  const iso = new Date(d.ora).toISOString()
  const chips = (['in_corso', 'bloccato', 'da_fare', 'fatto'] as const)
    .map(x => `<span class="pill s-${x}">${ETICHETTA[x]} <b class="num">${conta(x)}</b></span>`)
    .join('')

  return `<title>${esc(titoloPagina(s, d.progetto))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Quadro di controllo: riepilogo, poi ciò che chiede attenzione, poi i blocchi in colonna. */
:root {
  --bg: #f3f5f8; --surface: #ffffff; --ink: #15202b; --muted: #5a6776; --line: #dbe1e8;
  --accent: #1d5fc4;
  --ok: #17794a; --run: #a86300; --stop: #b3261e; --todo: #7b8794;
  --f-ui: "Instrument Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
  --f-num: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0e1319; --surface: #151c25; --ink: #e5eaf0; --muted: #98a5b4; --line: #253141;
  --accent: #7eb0ff; --ok: #4fc58b; --run: #f0b04a; --stop: #ff7d74; --todo: #7f8c9a; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0e1319; --surface: #151c25; --ink: #e5eaf0; --muted: #98a5b4; --line: #253141;
  --accent: #7eb0ff; --ok: #4fc58b; --run: #f0b04a; --stop: #ff7d74; --todo: #7f8c9a; color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--bg); color: var(--ink); font: 15px/1.5 var(--f-ui) }
.pagina { max-width: 68rem; margin: 0 auto; padding-inline: 16px; padding-block: 1.5rem 3rem; display: grid; gap: 1.5rem }
.num { font-family: var(--f-num); font-variant-numeric: tabular-nums }
h1, h2, h3 { text-wrap: balance; margin: 0 }
a { color: var(--accent) }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px }
.testa { display: grid; gap: .75rem }
.occhiello { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600 }
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
.s-da_fare { color: var(--muted); border-color: var(--line) }
.chip { font-size: .75rem; padding: .1rem .5rem; border-radius: 6px; background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--ink); font-family: var(--f-num) }
.serve { border: 1px solid color-mix(in srgb, var(--stop) 45%, var(--line)); background: color-mix(in srgb, var(--stop) 6%, var(--surface)); border-radius: 10px; padding: 1.1rem 1.25rem; display: grid; gap: .8rem }
.serve h2 { font-size: 1.1rem; color: var(--stop) }
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
.passo { display: grid; grid-template-columns: 5.6rem 1fr; gap: .6rem; align-items: start }
.passo .pill { justify-content: center }
.titolo-passo { min-width: 0; overflow-wrap: anywhere }
.motivo { display: block; color: var(--stop); font-size: .85rem }
.vuoto { margin: 0; color: var(--muted) }
.dati { margin: 0; display: grid; gap: .5rem; border-top: 1px dashed var(--line); padding-top: .8rem }
.riga { display: grid; grid-template-columns: 6rem 1fr; gap: .6rem; align-items: center }
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
<main class="pagina">
<header class="testa">
<span class="occhiello">Navigator · ${esc(d.progetto)}</span>
<h1>${esc(s.titolo ?? d.progetto)}</h1>
<div class="meta"><span>Ultimo aggiornamento: <time id="agg" datetime="${iso}">${fmtUtc(d.ora)}</time></span><span>Pubblicazione n. <span class="num">${d.numero}</span></span></div>
</header>
<section class="riepilogo" aria-label="Avanzamento complessivo">
<div class="cifra"><span class="pct">${pct}%</span><span class="di"><span class="num">${fatti}</span> di <span class="num">${s.passi.length}</span> passi fatti</span></div>
${barra(pct)}
<div class="chips">${chips}</div>
</section>
${sezioneServe(s)}
<section class="blocchi" aria-labelledby="blocchi-t">
<h2 id="blocchi-t">Blocchi</h2>
${gruppi.map(g => sezioneBlocco(s, g, d, gruppi.length === 1)).join('\n')}
</section>
<p class="piede">Aggiornato da Claude Code a ogni avanzamento. Questa pagina si rinnova da sola.</p>
</main>
<script>
(function () {
  try {
    var t = document.getElementById('agg');
    var d = new Date(t.getAttribute('datetime'));
    t.textContent = d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {}
})();
</script>
`
}
