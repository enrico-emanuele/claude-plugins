// La parte pura del navigator: configurazione, stato, regole di innesco e di
// ripubblicazione. Niente `$` qui dentro, così i test la esercitano da sola.

import type {
  NavigatorBlocco,
  NavigatorDecisione,
  NavigatorFermo,
  NavigatorPasso,
  NavigatorStato,
  NavigatorStatoPasso,
} from '../types'

export type Cadenza = 'passo-chiuso' | 'ogni-cambio' | 'solo-blocchi'

export type Sezioni = { requisiti: boolean; test: boolean; pr: boolean; screenshot: boolean }

export type Config = { isAcceso: boolean; soglia: number; cadenza: Cadenza; sezioni: Sezioni }

const CADENZE: readonly Cadenza[] = ['passo-chiuso', 'ogni-cambio', 'solo-blocchi']

export const STATO_INIZIALE: NavigatorStato = {
  isAttivo: false,
  isSpento: false,
  isForzato: false,
  titolo: null,
  fonte: null,
  passi: [],
  fermi: [],
  decisioni: [],
  blocchi: [],
  revisione: 0,
  revisionePubblicata: 0,
  url: null,
  file: null,
  pubblicazioni: 0,
  ultimaPubblicazione: null,
  errore: null,
}

// ---------------------------------------------------------------- config

type Opzioni = Readonly<Record<string, unknown>>

const comeBool = (v: unknown, base: boolean): boolean => (typeof v === 'boolean' ? v : base)

const comeSoglia = (v: unknown, base: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : base

const comeCadenza = (v: unknown, base: Cadenza): Cadenza =>
  CADENZE.includes(v as Cadenza) ? (v as Cadenza) : base

/**
 * Le opzioni del plugin (userConfig) con sopra l'override del progetto,
 * `.claude/navigator.json`: ogni chiave assente nell'override resta quella
 * dell'utente.
 */
export function leggiConfig(opzioni: Opzioni, override: unknown): Config {
  const base: Config = {
    isAcceso: comeBool(opzioni.attivo, true),
    soglia: comeSoglia(opzioni.soglia_passi, 5),
    cadenza: comeCadenza(opzioni.cadenza, 'passo-chiuso'),
    sezioni: {
      requisiti: comeBool(opzioni.sezione_requisiti, true),
      test: comeBool(opzioni.sezione_test, true),
      pr: comeBool(opzioni.sezione_pr, true),
      screenshot: comeBool(opzioni.sezione_screenshot, true),
    },
  }
  if (override === null || typeof override !== 'object') return base
  const o = override as Record<string, unknown>
  const s = (o.sezioni ?? {}) as Record<string, unknown>
  return {
    isAcceso: comeBool(o.attivo, base.isAcceso),
    soglia: comeSoglia(o.soglia_passi, base.soglia),
    cadenza: comeCadenza(o.cadenza, base.cadenza),
    sezioni: {
      requisiti: comeBool(s.requisiti, base.sezioni.requisiti),
      test: comeBool(s.test, base.sezioni.test),
      pr: comeBool(s.pr, base.sezioni.pr),
      screenshot: comeBool(s.screenshot, base.sezioni.screenshot),
    },
  }
}

// ---------------------------------------------------------------- passi

const PREFISSO_BLOCCO = /^\s*\[([^\]]{1,80})\]\s*(.+)$/s

/** «[Pagamenti] Migrazione fatture» → blocco «Pagamenti», titolo «Migrazione fatture». */
export function separaBlocco(testo: string): { blocco: string | null; titolo: string } {
  const m = PREFISSO_BLOCCO.exec(testo)
  return m ? { blocco: m[1]!.trim(), titolo: m[2]!.trim() } : { blocco: null, titolo: testo.trim() }
}

const daStatoTask = (s: string | undefined): NavigatorStatoPasso =>
  s === 'completed' ? 'fatto' : s === 'in_progress' ? 'in_corso' : 'da_fare'

const conRevisione = (s: NavigatorStato, cambio: Partial<NavigatorStato>): NavigatorStato => ({
  ...s,
  ...cambio,
  revisione: s.revisione + 1,
})

export function conTaskCreato(s: NavigatorStato, id: string, subject: string): NavigatorStato {
  const passo: NavigatorPasso = { id, ...separaBlocco(subject), stato: 'da_fare' }
  const passi = s.fonte === 'task' ? s.passi.filter(p => p.id !== id) : []
  return conRevisione(s, { fonte: 'task', passi: [...passi, passo] })
}

export function conTaskAggiornato(
  s: NavigatorStato,
  u: { taskId: string; subject?: string; status?: string },
): NavigatorStato {
  if (s.fonte !== 'task' || !s.passi.some(p => p.id === u.taskId)) return s
  if (u.status === 'deleted') {
    return conRevisione(s, { passi: s.passi.filter(p => p.id !== u.taskId) })
  }
  const passi = s.passi.map(p => {
    if (p.id !== u.taskId) return p
    const nome = u.subject === undefined ? {} : separaBlocco(u.subject)
    const stato = u.status === undefined ? p.stato : daStatoTask(u.status)
    return { ...p, ...nome, stato }
  })
  return conRevisione(s, { passi })
}

export function conTodo(
  s: NavigatorStato,
  todos: readonly { content: string; status: string }[],
): NavigatorStato {
  const passi = todos.map((t, i) => ({
    id: `todo-${i + 1}`,
    ...separaBlocco(t.content),
    stato: daStatoTask(t.status),
  }))
  return conRevisione(s, { fonte: 'todo', passi })
}

// ---------------------------------------------------------------- strumento

export type Aggiornamento = {
  titolo?: string
  passi?: { titolo: string; stato: NavigatorStatoPasso; blocco?: string }[]
  bloccati?: NavigatorFermo[]
  decisioni?: NavigatorDecisione[]
  blocchi?: NavigatorBlocco[]
}

/**
 * Applica una chiamata dello strumento `aggiorna`. `passi` vale solo quando la
 * sessione non ha una lista task (TaskCreate/TodoWrite): quella resta la fonte.
 * `bloccati` e `decisioni` sostituiscono la lista intera; `blocchi` si fonde per
 * nome, campo per campo.
 */
export function conAggiornamento(s: NavigatorStato, a: Aggiornamento): NavigatorStato {
  const cambio: Partial<NavigatorStato> = {}
  if (typeof a.titolo === 'string' && a.titolo.trim() !== '') cambio.titolo = a.titolo.trim()
  if (Array.isArray(a.passi) && (s.fonte === null || s.fonte === 'strumento')) {
    cambio.fonte = 'strumento'
    cambio.passi = a.passi.map((p, i) => {
      const nome = separaBlocco(p.titolo)
      return {
        id: `passo-${i + 1}`,
        titolo: nome.titolo,
        blocco: p.blocco?.trim() || nome.blocco,
        stato: p.stato === 'fatto' || p.stato === 'in_corso' ? p.stato : 'da_fare',
      }
    })
  }
  if (Array.isArray(a.bloccati)) cambio.fermi = a.bloccati.filter(f => f.passo && f.motivo)
  if (Array.isArray(a.decisioni)) cambio.decisioni = a.decisioni.filter(d => d.domanda)
  if (Array.isArray(a.blocchi)) {
    const blocchi = [...s.blocchi]
    for (const b of a.blocchi) {
      if (!b.nome) continue
      const i = blocchi.findIndex(x => x.nome.toLowerCase() === b.nome.toLowerCase())
      if (i < 0) blocchi.push(b)
      else blocchi[i] = { ...blocchi[i]!, ...b, nome: blocchi[i]!.nome }
    }
    cambio.blocchi = blocchi
  }
  return conRevisione(s, cambio)
}

// ---------------------------------------------------------------- lettura

export type StatoMostrato = NavigatorStatoPasso | 'bloccato'

const normale = (t: string) => separaBlocco(t).titolo.toLowerCase()

/** Il fermo che riguarda il passo, se c'è: per id, poi per titolo. */
export function fermoDi(s: NavigatorStato, p: NavigatorPasso): NavigatorFermo | undefined {
  const titolo = p.titolo.toLowerCase()
  return s.fermi.find(f => f.passo === p.id || normale(f.passo) === titolo)
}

/** Un passo fatto non è mai fermo: il fermo vale finché il passo è aperto. */
export const statoMostrato = (s: NavigatorStato, p: NavigatorPasso): StatoMostrato =>
  p.stato !== 'fatto' && fermoDi(s, p) ? 'bloccato' : p.stato

export function percentuale(passi: readonly NavigatorPasso[]): number {
  if (passi.length === 0) return 0
  return Math.round((passi.filter(p => p.stato === 'fatto').length / passi.length) * 100)
}

export type Gruppo = { nome: string | null; passi: NavigatorPasso[]; dati: NavigatorBlocco | undefined }

/** I passi raggruppati per blocco, nell'ordine in cui i blocchi compaiono. */
export function raggruppa(s: NavigatorStato): Gruppo[] {
  const gruppi: Gruppo[] = []
  const trova = (nome: string | null) => {
    const chiave = nome?.toLowerCase() ?? null
    let g = gruppi.find(x => (x.nome?.toLowerCase() ?? null) === chiave)
    if (!g) {
      const dati = nome === null ? undefined : s.blocchi.find(b => b.nome.toLowerCase() === chiave)
      g = { nome, passi: [], dati }
      gruppi.push(g)
    }
    return g
  }
  for (const p of s.passi) trova(p.blocco).passi.push(p)
  for (const b of s.blocchi) trova(b.nome)
  return gruppi
}

// ---------------------------------------------------------------- regole

/** Si attiva una volta sola per sessione: alla soglia, o a mano con /navigator. */
export function conAttivazione(s: NavigatorStato, c: Config): NavigatorStato {
  if (s.isAttivo || s.isSpento || !c.isAcceso) return s
  if (!s.isForzato && s.passi.length < c.soglia) return s
  return { ...s, isAttivo: true }
}

const fatti = (s: NavigatorStato) => new Set(s.passi.filter(p => p.stato === 'fatto').map(p => p.id))

const blocchiChiusi = (s: NavigatorStato) =>
  new Set(
    raggruppa(s)
      .filter(g => g.passi.length > 0 && g.passi.every(p => p.stato === 'fatto'))
      .map(g => g.nome ?? ''),
  )

const ugualeJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export type Origine = 'lista' | 'strumento'

/**
 * Perché ripubblicare subito dopo il passaggio da `prima` a `dopo`, oppure
 * null. Attivazione, fermi, decisioni e chiusura del lavoro pubblicano a ogni
 * cadenza; il resto dipende dalla cadenza scelta.
 */
export function motivoPubblicazione(
  prima: NavigatorStato,
  dopo: NavigatorStato,
  cadenza: Cadenza,
  origine: Origine,
): string | null {
  if (!dopo.isAttivo || dopo.isSpento) return null
  if (!prima.isAttivo) return 'attivazione'
  if (dopo.revisione === prima.revisione) return null
  const nuoviFermi = dopo.fermi.some(f => !prima.fermi.some(g => ugualeJson(f, g)))
  if (nuoviFermi) return 'passo fermo'
  if (!ugualeJson(prima.decisioni, dopo.decisioni) && dopo.decisioni.length > 0) return 'decisione'
  const tutto = (s: NavigatorStato) => s.passi.length > 0 && percentuale(s.passi) === 100
  if (tutto(dopo) && !tutto(prima)) return 'lavoro chiuso'
  if (cadenza === 'ogni-cambio') return 'cambio'
  if (cadenza === 'passo-chiuso') {
    const giaFatti = fatti(prima)
    if ([...fatti(dopo)].some(id => !giaFatti.has(id))) return 'passo chiuso'
    if (origine === 'strumento') return 'dati del blocco'
    return null
  }
  const giaChiusi = blocchiChiusi(prima)
  if ([...blocchiChiusi(dopo)].some(n => !giaChiusi.has(n))) return 'blocco chiuso'
  return null
}

/** Ci sono cambi non ancora pubblicati. */
export const isSporco = (s: NavigatorStato) => s.revisione !== s.revisionePubblicata
