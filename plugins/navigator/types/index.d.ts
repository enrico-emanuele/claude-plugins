export type NavigatorStatoPasso = 'da_fare' | 'in_corso' | 'fatto'

export type NavigatorPasso = {
  id: string
  titolo: string
  blocco: string | null
  stato: NavigatorStatoPasso
}

export type NavigatorFermo = { passo: string; motivo: string }

export type NavigatorDecisione = { domanda: string; contesto?: string; blocco?: string }

export type NavigatorTest = { passati: number; totali: number; nota?: string }

export type NavigatorPR = { stato: string; numero?: string; url?: string; titolo?: string }

export type NavigatorScreenshot = { percorso: string; didascalia?: string }

export type NavigatorBlocco = {
  nome: string
  requisiti?: string[]
  test?: NavigatorTest
  pr?: NavigatorPR
  screenshot?: NavigatorScreenshot[]
}

export type NavigatorFonte = 'task' | 'todo' | 'strumento'

export type NavigatorStato = {
  isAttivo: boolean
  isSpento: boolean
  isForzato: boolean
  titolo: string | null
  fonte: NavigatorFonte | null
  passi: NavigatorPasso[]
  fermi: NavigatorFermo[]
  decisioni: NavigatorDecisione[]
  blocchi: NavigatorBlocco[]
  revisione: number
  revisionePubblicata: number
  url: string | null
  file: string | null
  pubblicazioni: number
  ultimaPubblicazione: number | null
  errore: string | null
}

declare module 'claude-code' {
  interface PluginState {
    navigator: { stato: NavigatorStato }
  }
}
