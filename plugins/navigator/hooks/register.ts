import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { NavigatorStato } from '../types'
import type { Aggiornamento, Config, Origine } from './logica'
import {
  STATO_INIZIALE,
  conAggiornamento,
  conAttivazione,
  conTaskAggiornato,
  conTaskCreato,
  conTodo,
  isSporco,
  leggiConfig,
  motivoPubblicazione,
  percentuale,
} from './logica'
import { renderPagina, titoloPagina } from './pagina'

const stato = atom({ plugin: 'navigator', key: 'stato' } as const, STATO_INIZIALE)

const STRUMENTO = 'aggiorna'
const NOME_STRUMENTO = 'mcp__navigator__aggiorna'
const RITARDO_MS = 1500
const MAX_BYTE_IMMAGINI = 12 * 1024 * 1024
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

type $ = EngineInterface

let config: Config = leggiConfig({}, null)
let timer: { cancel: () => void } | null = null
let isInPubblicazione = false
let isRichiestaPendente = false

// ------------------------------------------------------------ pubblicazione

async function leggiOverride($: $): Promise<unknown> {
  try {
    const file = `${await $.session.root()}/.claude/navigator.json`
    return (await $.fs.exists(file)) ? JSON.parse(await $.fs.read(file)) : null
  } catch {
    return null
  }
}

async function immagini($: $, s: NavigatorStato, root: string) {
  const out: Record<string, string | null> = {}
  if (!config.sezioni.screenshot) return out
  let totale = 0
  const percorsi = s.blocchi.flatMap(b => (b.screenshot ?? []).slice(-4).map(x => x.percorso))
  for (const percorso of percorsi) {
    const mime = MIME[percorso.split('.').pop()?.toLowerCase() ?? '']
    if (!mime) { out[percorso] = null; continue }
    try {
      const assoluto = percorso.startsWith('/') ? percorso : `${root}/${percorso}`
      const { base64 } = await $.fs.read(assoluto, { as: 'bytes' })
      totale += base64.length
      out[percorso] = totale > MAX_BYTE_IMMAGINI ? null : `data:${mime};base64,${base64}`
    } catch {
      out[percorso] = null
    }
  }
  return out
}

async function avvisaLink($: $, url: string, isNuovo: boolean) {
  const testo = isNuovo
    ? `Navigator pubblicato: ${url}`
    : `Il navigator ha un nuovo indirizzo: ${url}`
  $.ui.toast(testo, { timeoutMs: 10000 })
  await $.session.append({ message: { type: 'system', content: [{ type: 'text', text: testo }] } })
  await $.session.append({
    message: {
      type: 'user',
      content: [{
        type: 'text',
        text: `[plugin navigator] ${testo}. Nel tuo prossimo messaggio all'utente riporta questo link, una volta sola; poi non serve ripeterlo. Il plugin lo ripubblica da solo allo stesso indirizzo.`,
      }],
    },
  })
}

async function pubblica($: $): Promise<void> {
  timer = null
  if (isInPubblicazione) { isRichiestaPendente = true; return }
  const s = await read($, stato)
  if (!s.isAttivo || s.isSpento) return
  isInPubblicazione = true
  try {
    const root = await $.session.root()
    const sessione = await $.session.id()
    const cartella = `${root}/.claude/navigator`
    const file = `${cartella}/${sessione}.html`
    const progetto = root.split('/').filter(Boolean).pop() ?? 'progetto'
    const ora = await $.clock.now()
    if (!(await $.fs.exists(`${cartella}/.gitignore`))) await $.fs.write(`${cartella}/.gitignore`, '*\n')
    const html = renderPagina({
      stato: s, sezioni: config.sezioni, progetto, ora, numero: s.pubblicazioni + 1,
      immagini: await immagini($, s, root),
    })
    await $.fs.write(file, html)

    const strumenti = await $.tool.list()
    if (!strumenti.some(t => t.name === 'Artifact')) {
      if (s.file !== file) $.ui.toast(`Navigator salvato in locale (Artifact non disponibile): ${file}`, { timeoutMs: 10000 })
      await update($, stato, x => ({ ...x, file, revisionePubblicata: s.revisione, errore: 'Artifact non disponibile in questa sessione' }))
      return
    }

    const base = {
      tool: 'Artifact' as const,
      action: 'publish' as const,
      file_path: file,
      description: `Avanzamento di «${titoloPagina(s, progetto).replace(/^Navigator /, '')}»: passi, blocchi e decisioni aperte.`,
    }
    let esito = await $.tool.call(s.url ? { ...base, url: s.url } : { ...base, icon: 'chart' })
    if (s.url && (esito.deny !== undefined || esito.isError === true)) {
      // L'indirizzo vecchio non si aggiorna (sessione ripresa, artefatto cancellato): se ne apre uno nuovo.
      esito = await $.tool.call({ ...base, icon: 'chart' })
    }
    if (esito.deny !== undefined || esito.isError === true) {
      const motivo = (esito.deny ?? esito.text ?? 'errore sconosciuto').slice(0, 300)
      $.ui.toast(`Navigator: pubblicazione non riuscita. ${motivo}`, { timeoutMs: 8000 })
      await update($, stato, x => ({ ...x, file, errore: motivo }))
      return
    }
    const risultato = esito.result as { url?: unknown } | undefined
    const url = typeof risultato?.url === 'string'
      ? risultato.url
      : /https:\/\/claude\.ai\/\S*artifact\/[\w-]+/.exec(esito.text ?? '')?.[0] ?? s.url
    await update($, stato, x => ({
      ...x, url, file, errore: null,
      pubblicazioni: x.pubblicazioni + 1,
      ultimaPubblicazione: ora,
      revisionePubblicata: s.revisione,
    }))
    if (url && url !== s.url) {
      await $.store.set(`url:${sessione}`, url)
      await avvisaLink($, url, s.url === null)
    }
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err)
    await update($, stato, x => ({ ...x, errore: motivo.slice(0, 300) }))
  } finally {
    isInPubblicazione = false
    if (isRichiestaPendente) {
      isRichiestaPendente = false
      programma($, RITARDO_MS)
    }
  }
}

/** Raggruppa le richieste vicine in una sola pubblicazione. */
function programma($: $, ms: number) {
  if (timer !== null) return
  timer = $.clock.after(ms, () => { void pubblica($) })
}

/** Applica un cambio di stato e, se la cadenza lo chiede, programma la pubblicazione. */
async function cambia($: $, fn: (s: NavigatorStato) => NavigatorStato, origine: Origine) {
  let prima = STATO_INIZIALE
  let dopo = STATO_INIZIALE
  await update($, stato, s => {
    prima = s
    dopo = conAttivazione(fn(s), config)
    return dopo
  })
  if (motivoPubblicazione(prima, dopo, config.cadenza, origine) !== null) programma($, RITARDO_MS)
  return dopo
}

// ------------------------------------------------------------ istruzioni al modello

function istruzioni(): string {
  const extra = [
    'i passi fermi e perché',
    "le decisioni che servono dall'utente",
    config.sezioni.requisiti && 'i requisiti coperti',
    config.sezioni.test && 'i test che passano',
    config.sezioni.pr && 'la PR e il suo stato',
    config.sezioni.screenshot && "gli screenshot dell'interfaccia (percorsi di file PNG/JPG)",
  ].filter(Boolean).join(', ')
  return `# Navigator: avanzamento dei lavori lunghi
Nei lavori lunghi il plugin navigator crea e ripubblica da solo una pagina HTML di avanzamento (Artifact) con i passi del tuo piano. Non crearlo né pubblicarlo tu, e non chiedere all'utente se lo vuole.
- Parte quando la tua lista di passi (TaskCreate o TodoWrite; se non li hai, lo strumento ${NOME_STRUMENTO} con \`passi\`) arriva a ${config.soglia} passi.
- Raggruppa i passi in blocchi mettendo il nome del blocco fra quadre in testa al titolo del passo: «[Pagamenti] Migrazione della tabella fatture».
- Con ${NOME_STRUMENTO} dai al navigator ciò che la lista non sa, per blocco: ${extra}. Chiamalo quando uno di questi cambia, di solito alla chiusura di un passo; un passo fermo o una decisione nuova vanno segnalati subito.
- Quando il plugin ti passa il link della prima pubblicazione, riportalo all'utente una volta.`
}

function schemaStrumento() {
  const blocco: Record<string, unknown> = {
    nome: { type: 'string', description: 'Nome del blocco, lo stesso usato fra quadre nei titoli dei passi.' },
  }
  if (config.sezioni.requisiti) blocco.requisiti = { type: 'array', items: { type: 'string' }, description: 'ID o nomi brevi dei requisiti coperti (es. "RF-12").' }
  if (config.sezioni.test) {
    blocco.test = {
      type: 'object',
      properties: { passati: { type: 'integer' }, totali: { type: 'integer' }, nota: { type: 'string' } },
      required: ['passati', 'totali'],
    }
  }
  if (config.sezioni.pr) {
    blocco.pr = {
      type: 'object',
      properties: {
        stato: { type: 'string', enum: ['bozza', 'aperta', 'in revisione', 'approvata', 'fusa', 'chiusa'] },
        numero: { type: 'string' }, url: { type: 'string' }, titolo: { type: 'string' },
      },
      required: ['stato'],
    }
  }
  if (config.sezioni.screenshot) {
    blocco.screenshot = {
      type: 'array',
      description: 'Screenshot già salvati su file (PNG/JPG/WebP), percorso assoluto o relativo al progetto. Il navigator mostra gli ultimi 4.',
      items: { type: 'object', properties: { percorso: { type: 'string' }, didascalia: { type: 'string' } }, required: ['percorso'] },
    }
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      titolo: { type: 'string', description: 'Nome breve del lavoro, 2-4 parole (es. "Pagamenti Stripe").' },
      passi: {
        type: 'array',
        description: 'SOLO se non usi TaskCreate/TodoWrite: la lista completa dei passi, che sostituisce la precedente.',
        items: {
          type: 'object',
          properties: {
            titolo: { type: 'string' },
            stato: { type: 'string', enum: ['da_fare', 'in_corso', 'fatto'] },
            blocco: { type: 'string' },
          },
          required: ['titolo', 'stato'],
        },
      },
      bloccati: {
        type: 'array',
        description: 'Lista COMPLETA dei passi fermi, che sostituisce la precedente ([] li sblocca tutti). `passo` è il titolo o l\'id del passo.',
        items: { type: 'object', properties: { passo: { type: 'string' }, motivo: { type: 'string' } }, required: ['passo', 'motivo'] },
      },
      decisioni: {
        type: 'array',
        description: "Lista COMPLETA delle decisioni che servono dall'utente, che sostituisce la precedente ([] = nessuna).",
        items: {
          type: 'object',
          properties: { domanda: { type: 'string' }, contesto: { type: 'string' }, blocco: { type: 'string' } },
          required: ['domanda'],
        },
      },
      blocchi: {
        type: 'array',
        description: "Dati per blocco, uniti per nome a quelli già dati: un campo omesso resta com'era.",
        items: { type: 'object', properties: blocco, required: ['nome'] },
      },
    },
  }
}

export const register: Register = (on, options) => {
  config = leggiConfig(options, null)

  // ------------------------------------------------------------ sessione

  on('session.start', async ($, e, next) => {
    config = leggiConfig(options, await leggiOverride($))
    await $.command.register({
      name: 'navigator',
      description: 'Navigator: stato e link; «pubblica» lo crea o aggiorna ora, «spegni»/«accendi» per questa sessione.',
      argumentHint: '[pubblica | spegni | accendi]',
    })
    if (config.isAcceso) {
      await $.tool.register({
        name: STRUMENTO,
        description: 'Aggiorna il navigator con ciò che la lista dei passi non sa: passi fermi, decisioni che servono dall\'utente e dati per blocco. Ogni campo è facoltativo.',
        inputSchema: schemaStrumento(),
        isDeferred: false,
      })
    }
    const s = await read($, stato)
    if (s.url === null) {
      const salvato = await $.store.get(`url:${await $.session.id()}`)
      if (typeof salvato === 'string') await update($, stato, x => ({ ...x, url: salvato }))
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composto = await next(e)
    const s = await read($, stato)
    if (!config.isAcceso || s.isSpento) return composto
    return { sections: [...composto.sections, { id: 'navigator:istruzioni', text: istruzioni(), scope: 'session' as const }] }
  })

  // ------------------------------------------------------------ lista dei passi

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const esito = await next(e)
    if (e.agentId !== undefined || esito.deny !== undefined || esito.isError === true) return esito
    const id = esito.result?.task?.id
    if (typeof id === 'string') await cambia($, s => conTaskCreato(s, id, e.subject), 'lista')
    return esito
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const esito = await next(e)
    if (e.agentId !== undefined || esito.deny !== undefined || esito.isError === true) return esito
    await cambia($, s => conTaskAggiornato(s, { taskId: e.taskId, subject: e.subject, status: e.status }), 'lista')
    return esito
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const esito = await next(e)
    if (e.agentId !== undefined || esito.deny !== undefined || esito.isError === true) return esito
    await cambia($, s => conTodo(s, e.todos), 'lista')
    return esito
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: NOME_STRUMENTO }, async ($, e) => {
    const { tool: _t, tool_use_id: _id, agentId: _a, requestMeta: _m, ...input } = e as Record<string, unknown>
    const dopo = await cambia($, s => conAggiornamento(s, input as Aggiornamento), 'strumento')
    const passi = dopo.passi.length
    const testo = dopo.isAttivo
      ? `Navigator aggiornato (${percentuale(dopo.passi)}%, ${passi} passi). Si ripubblica da solo.`
      : dopo.isSpento
        ? 'Dati salvati; il navigator è spento per questa sessione.'
        : `Dati salvati; il navigator parte a ${config.soglia} passi (ora ${passi}).`
    return { result: testo }
  })

  // ------------------------------------------------------------ fine del turno

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const s = await read($, stato)
      if (s.isAttivo && !s.isSpento && isSporco(s)) programma($, 0)
    }
    return next(e)
  })

  // ------------------------------------------------------------ /navigator

  on('command.run', { command: 'navigator' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'spegni') {
      await update($, stato, s => ({ ...s, isSpento: true }))
      timer?.cancel()
      timer = null
      return { text: 'Navigator spento per questa sessione. «/navigator accendi» per riaccenderlo.' }
    }
    if (arg === 'accendi') {
      await cambia($, s => ({ ...s, isSpento: false }), 'lista')
      return { text: 'Navigator riacceso per questa sessione.' }
    }
    if (arg === 'pubblica') {
      if (!config.isAcceso) return { text: 'Il navigator è disattivato nella configurazione (opzione «attivo» o .claude/navigator.json).' }
      await cambia($, s => ({ ...s, isForzato: true, isSpento: false }), 'lista')
      timer?.cancel()
      timer = null
      programma($, 0)
      return { text: 'Pubblico il navigator adesso.' }
    }
    const s = await read($, stato)
    const righe = [
      !config.isAcceso ? 'Disattivato nella configurazione.'
        : s.isSpento ? 'Spento per questa sessione.'
        : s.isAttivo ? `Attivo: ${percentuale(s.passi)}% (${s.passi.filter(p => p.stato === 'fatto').length}/${s.passi.length} passi).`
        : `In attesa: parte a ${config.soglia} passi (ora ${s.passi.length}).`,
      s.url ? `Link: ${s.url}` : s.file ? `File locale: ${s.file}` : 'Non ancora pubblicato.',
      `Cadenza: ${config.cadenza}.`,
      s.errore ? `Ultimo errore: ${s.errore}` : '',
    ].filter(Boolean)
    return { text: righe.join('\n') }
  })
}
