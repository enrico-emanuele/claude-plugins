import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { STATO_INIZIALE, conAggiornamento, conAttivazione, conTaskAggiornato, conTaskCreato, leggiConfig, motivoPubblicazione, separaBlocco } from '../hooks/logica'
import type { Config } from '../hooks/logica'
import { renderPagina } from '../hooks/pagina'

const CONFIG: Config = leggiConfig({}, null)

const conPassi = (n: number, cfg = CONFIG) => {
  let s = STATO_INIZIALE
  for (let i = 1; i <= n; i++) s = conAttivazione(conTaskCreato(s, String(i), `[Blocco ${i <= 3 ? 'A' : 'B'}] Passo ${i}`), cfg)
  return s
}

describe('regole', () => {
  test('il prefisso fra quadre diventa il blocco', () => {
    expect(separaBlocco('[Pagamenti] Migrazione fatture')).toEqual({ blocco: 'Pagamenti', titolo: 'Migrazione fatture' })
    expect(separaBlocco('Senza blocco')).toEqual({ blocco: null, titolo: 'Senza blocco' })
  })

  test('si attiva alla soglia, non prima', () => {
    expect(conPassi(4).isAttivo).toBe(false)
    expect(conPassi(5).isAttivo).toBe(true)
    expect(conPassi(2, { ...CONFIG, soglia: 2 }).isAttivo).toBe(true)
    expect(conPassi(9, { ...CONFIG, isAcceso: false }).isAttivo).toBe(false)
  })

  test("l'override del progetto vince sulle opzioni, chiave per chiave", () => {
    const c = leggiConfig({ soglia_passi: 8, cadenza: 'ogni-cambio' }, { soglia_passi: 3, sezioni: { pr: false } })
    expect(c.soglia).toBe(3)
    expect(c.cadenza).toBe('ogni-cambio')
    expect(c.sezioni).toEqual({ requisiti: true, test: true, pr: false, screenshot: true })
    expect(leggiConfig({}, { cadenza: 'a caso' }).cadenza).toBe('passo-chiuso')
  })

  test('passo-chiuso: pubblica alla chiusura, non all\'avvio di un passo', () => {
    const s = conPassi(5)
    const avviato = conTaskAggiornato(s, { taskId: '1', status: 'in_progress' })
    expect(motivoPubblicazione(s, avviato, 'passo-chiuso', 'lista')).toBe(null)
    expect(motivoPubblicazione(s, avviato, 'ogni-cambio', 'lista')).toBe('cambio')
    const chiuso = conTaskAggiornato(avviato, { taskId: '1', status: 'completed' })
    expect(motivoPubblicazione(avviato, chiuso, 'passo-chiuso', 'lista')).toBe('passo chiuso')
    expect(motivoPubblicazione(avviato, chiuso, 'solo-blocchi', 'lista')).toBe(null)
  })

  test('solo-blocchi: pubblica quando un blocco intero si chiude', () => {
    let s = conPassi(5)
    s = conTaskAggiornato(s, { taskId: '1', status: 'completed' })
    s = conTaskAggiornato(s, { taskId: '2', status: 'completed' })
    const chiuso = conTaskAggiornato(s, { taskId: '3', status: 'completed' })
    expect(motivoPubblicazione(s, chiuso, 'solo-blocchi', 'lista')).toBe('blocco chiuso')
  })

  test('un passo fermo o una decisione pubblicano a ogni cadenza', () => {
    const s = conPassi(5)
    const fermo = conAggiornamento(s, { bloccati: [{ passo: 'Passo 4', motivo: 'manca la chiave' }] })
    const decisione = conAggiornamento(s, { decisioni: [{ domanda: 'Quale piano?' }] })
    for (const cadenza of ['passo-chiuso', 'ogni-cambio', 'solo-blocchi'] as const) {
      expect(motivoPubblicazione(s, fermo, cadenza, 'strumento')).toBe('passo fermo')
      expect(motivoPubblicazione(s, decisione, cadenza, 'strumento')).toBe('decisione')
    }
  })

  test('la pagina mostra passi, fermi, decisioni e solo le sezioni accese', () => {
    let s = conPassi(5)
    s = conTaskAggiornato(s, { taskId: '1', status: 'completed' })
    s = conAggiornamento(s, {
      titolo: 'Pagamenti Stripe',
      bloccati: [{ passo: 'Passo 4', motivo: 'manca la chiave <live>' }],
      decisioni: [{ domanda: 'Fatturare in EUR o AED?' }],
      blocchi: [{ nome: 'Blocco A', requisiti: ['RF-12'], pr: { stato: 'aperta', numero: '130' } }],
    })
    const html = renderPagina({ stato: s, sezioni: { ...CONFIG.sezioni, pr: false }, progetto: 'laic', ora: 0, numero: 1, immagini: {} })
    expect(html).toContain('<title>Navigator Pagamenti Stripe</title>')
    expect(html).toContain('>20%<')
    expect(html).toContain('Serve da te')
    expect(html).toContain('manca la chiave &lt;live&gt;')
    expect(html).toContain('RF-12')
    expect(html).not.toContain('#130')
  })
})

// ------------------------------------------------------------ giro completo

function mondo(on: On, registrati: string[] = []) {
  const scritti: Record<string, string> = {}
  const pubblicazioni: Record<string, unknown>[] = []
  let prossimoId = 0
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/progetto' }))
  on('session.id', () => ({ value: 'sessione-1' }))
  on('fs.exists', ($, e) => ({ value: e.path in scritti }))
  on('fs.write', ($, e) => { scritti[e.path] = e.text; return { value: undefined } })
  on('fs.read', ($, e) => (e.path in scritti ? { value: scritti[e.path]! } : { deny: 'ENOENT' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => { registrati.push(e.name); return { value: { tool: `mcp__navigator__${e.name}` } } })
  on('tool.list', () => ({ value: [{ name: 'Artifact', description: '', mcp: false }] }))
  on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: String(++prossimoId), subject: '' } } }))
  on('tool.call', { tool: 'TaskUpdate' }, ($, e) => ({ result: { success: true, taskId: e.taskId, updatedFields: [] } }))
  on('tool.call', { tool: 'Artifact' }, ($, e) => {
    pubblicazioni.push(e as unknown as Record<string, unknown>)
    return { result: { url: 'https://claude.ai/code/artifact/abc-123', path: String(e.file_path) } }
  })
  return { scritti, pubblicazioni }
}

test('5 passi: prima pubblicazione con link, poi stesso indirizzo', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 13, 12, 0) })
  mock.store(on)
  const sessione = mock.session(on)
  const { scritti, pubblicazioni } = mondo(on)
  await $.session.start({ cwd: '/progetto', surface: 'terminal', isInteractive: true })

  for (let i = 1; i <= 4; i++) await $.tool.call({ tool: 'TaskCreate', subject: `[Base] Passo ${i}`, description: '' })
  await clock.advance(2000)
  expect(pubblicazioni).toHaveLength(0)

  await $.tool.call({ tool: 'TaskCreate', subject: '[Base] Passo 5', description: '' })
  await clock.advance(2000)
  expect(pubblicazioni).toHaveLength(1)
  expect(pubblicazioni[0]).toMatchObject({ action: 'publish', file_path: '/progetto/.claude/navigator/sessione-1.html', icon: 'chart' })
  expect(scritti['/progetto/.claude/navigator/.gitignore']).toBe('*\n')
  const testi = sessione.appended().map(r => JSON.stringify(r.message.content))
  expect(testi.some(t => t.includes('https://claude.ai/code/artifact/abc-123'))).toBe(true)

  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'in_progress' })
  await clock.advance(2000)
  expect(pubblicazioni).toHaveLength(1)

  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await clock.advance(2000)
  expect(pubblicazioni).toHaveLength(2)
  expect(pubblicazioni[1]).toMatchObject({ url: 'https://claude.ai/code/artifact/abc-123' })
  expect(pubblicazioni[1]!.icon).toBeUndefined()
  expect(scritti['/progetto/.claude/navigator/sessione-1.html']).toContain('>20%<')
})

test('spento nella configurazione: niente strumento, niente pubblicazioni', { options: { attivo: false } }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const registrati: string[] = []
  const { pubblicazioni } = mondo(on, registrati)
  await $.session.start({ cwd: '/progetto', surface: 'terminal', isInteractive: true })
  for (let i = 1; i <= 6; i++) await $.tool.call({ tool: 'TaskCreate', subject: `Passo ${i}`, description: '' })
  await clock.advance(5000)
  expect(registrati).toHaveLength(0)
  expect(pubblicazioni).toHaveLength(0)
})
