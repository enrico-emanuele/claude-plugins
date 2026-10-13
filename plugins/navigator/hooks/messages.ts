// What navigator says to the user (toasts, /navigator), in the page's language.
// What it tells the model stays in English, in register.ts.

import type { Cadence, Language } from './logic'

export const MESSAGES = {
  en: {
    published: (url: string) => `Navigator published: ${url}`,
    newAddress: (url: string) => `Navigator has a new address: ${url}`,
    savedLocally: (file: string) => `Navigator saved locally (Artifact not available): ${file}`,
    failed: (reason: string) => `Navigator: publishing failed. ${reason}`,
    paused: 'Navigator paused: publishing was denied. "/navigator publish" tries again.',
    notifyBlocked: (text: string) => `Step blocked: ${text}`,
    notifyDecision: (text: string) => `Decision to make: ${text}`,
    off: 'Navigator is off for this session. "/navigator on" turns it back on.',
    on: 'Navigator is back on for this session.',
    disabled: 'Navigator is disabled in the settings ("enabled" option or .claude/navigator.json).',
    publishing: 'Publishing navigator now.',
    reset: 'Navigator starts a new job: steps, blocks and events cleared. The address stays the same.',
    noLink: 'Not published yet.',
    usage: 'Usage: /navigator [publish | link | reset | off | on]',
    stateDisabled: 'Disabled in the settings.',
    stateOff: 'Off for this session.',
    statePaused: 'Paused: publishing was denied. "/navigator publish" tries again.',
    stateActive: (pct: number, done: number, all: number) => `Active: ${pct}% (${done}/${all} steps).`,
    stateWaiting: (threshold: number, now: number) => `Waiting: starts at ${threshold} steps (now ${now}).`,
    link: (url: string) => `Link: ${url}`,
    localFile: (file: string) => `Local file: ${file}`,
    cadence: (c: Cadence, atTurnEnd: boolean) => `Cadence: ${c}${atTurnEnd ? ', plus the end of each turn' : ''}.`,
    lastError: (e: string) => `Last error: ${e}`,
  },
  it: {
    published: (url: string) => `Navigator pubblicato: ${url}`,
    newAddress: (url: string) => `Navigator ha un nuovo indirizzo: ${url}`,
    savedLocally: (file: string) => `Navigator salvato in locale (Artifact non disponibile): ${file}`,
    failed: (reason: string) => `Navigator: pubblicazione non riuscita. ${reason}`,
    paused: 'Navigator in pausa: la pubblicazione è stata negata. "/navigator publish" riprova.',
    notifyBlocked: (text: string) => `Passo fermo: ${text}`,
    notifyDecision: (text: string) => `Decisione da prendere: ${text}`,
    off: 'Navigator spento per questa sessione. "/navigator on" lo riaccende.',
    on: 'Navigator di nuovo acceso per questa sessione.',
    disabled: 'Navigator è disattivato nelle impostazioni (opzione "enabled" o .claude/navigator.json).',
    publishing: 'Pubblico navigator adesso.',
    reset: 'Navigator inizia un nuovo lavoro: passi, blocchi ed eventi azzerati. L\'indirizzo resta lo stesso.',
    noLink: 'Non ancora pubblicato.',
    usage: 'Uso: /navigator [publish | link | reset | off | on]',
    stateDisabled: 'Disattivato nelle impostazioni.',
    stateOff: 'Spento per questa sessione.',
    statePaused: 'In pausa: la pubblicazione è stata negata. "/navigator publish" riprova.',
    stateActive: (pct: number, done: number, all: number) => `Attivo: ${pct}% (${done}/${all} passi).`,
    stateWaiting: (threshold: number, now: number) => `In attesa: parte a ${threshold} passi (ora ${now}).`,
    link: (url: string) => `Link: ${url}`,
    localFile: (file: string) => `File locale: ${file}`,
    cadence: (c: Cadence, atTurnEnd: boolean) => `Cadenza: ${c}${atTurnEnd ? ', più la fine di ogni turno' : ''}.`,
    lastError: (e: string) => `Ultimo errore: ${e}`,
  },
} satisfies Record<Language, unknown>

export type Messages = (typeof MESSAGES)[Language]
