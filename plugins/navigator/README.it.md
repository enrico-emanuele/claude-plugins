# navigator

[English](README.md) · **Italiano**

Plugin per Claude Code. Nei lavori lunghi pubblica da solo una pagina HTML di avanzamento come Artifact, la ripubblica allo stesso indirizzo man mano che il lavoro avanza e manda il link una volta, alla prima pubblicazione. Non serve chiederlo nel prompt.

Il plugin è in inglese (opzioni, comando, messaggi); la pagina pubblicata può essere in inglese o in italiano.

## Cosa fa

- **Quando parte.** Quando il piano di Claude arriva alla soglia di passi (5 per default). Il piano è la lista task (`TaskCreate`/`TaskUpdate` o `TodoWrite`). Se la sessione non ha una lista task, Claude dichiara i passi con lo strumento del plugin.
- **Cosa mostra.** Sempre presenti: percentuale complessiva, passi per blocco con lo stato (da fare, in corso, fatto, bloccato), la sezione «Serve da te» con decisioni da prendere e passi fermi, data e ora dell'ultimo aggiornamento. Si accendono dalle impostazioni: requisiti coperti, test che passano, PR con il suo stato, screenshot dell'interfaccia. Ognuna compare solo se ha dati.
- **Blocchi.** Claude raggruppa i passi scrivendo il nome del blocco fra quadre in testa al titolo: `[Pagamenti] Migrazione fatture`. I blocchi chiusi si mostrano compressi.
- **Dati extra.** Claude li passa con lo strumento `mcp__navigator__update`: passi fermi, decisioni, e per ogni blocco requisiti, test, PR e screenshot.
- **Pubblicazione.** La fa il plugin, non Claude. La pagina è generata dal plugin con un formato fisso, scritta in `.claude/navigator/<sessione>.html` (cartella che si ignora da sola in git) e pubblicata con lo strumento Artifact. A fine turno, se c'è qualcosa di non pubblicato, il plugin ripubblica comunque.

## Impostazioni

Opzioni del plugin (`/config`, oppure `pluginConfigs` nelle impostazioni).

**Comportamento**

| Opzione | Default | Effetto |
| --- | --- | --- |
| `enabled` | `true` | Acceso o spento. |
| `step_threshold` | `5` | Numero di passi da cui parte la pagina. |
| `cadence` | `step-done` | `step-done`: a ogni passo chiuso. `every-change`: a ogni cambio di stato. `block-done`: quando un blocco intero si chiude. Con tutte e tre si ripubblica subito su passi fermi, decisioni nuove e lavoro concluso. |

**Lingua e colori**

| Opzione | Default | Effetto |
| --- | --- | --- |
| `language` | `en` | Lingua della pagina pubblicata: `en` (inglese) o `it` (italiano). |
| `theme` | `standard` | Tavolozza di partenza: `standard`, `high-contrast` (alto contrasto) o `muted` (tenue). Ognuna ha la versione chiara e quella scura. |
| `color_background` | tema | Sfondo della pagina. |
| `color_surface` | tema | Riquadri (riepilogo e blocchi). |
| `color_text` | tema | Testo. |
| `color_accent` | tema | Accento: link, occhiello, etichette. |
| `color_done` | tema | Stato «fatto» e barre di avanzamento. |
| `color_in_progress` | tema | Stato «in corso». |
| `color_blocked` | tema | Stato «bloccato». |
| `color_todo` | tema | Stato «da fare». |
| `color_attention` | tema | Sezione «Serve da te». Se è impostato solo `color_blocked`, segue quello. |

I colori sono esadecimali (`#1d5fc4`, `#fff`); vuoto vuol dire quello del tema. Un colore personalizzato vale per la versione chiara e per quella scura. Ogni altro valore viene ignorato.

**Sezioni e dettaglio**

| Opzione | Default | Effetto |
| --- | --- | --- |
| `section_requirements` | `true` | Requisiti coperti per blocco. |
| `section_tests` | `true` | Test che passano per blocco. |
| `section_pr` | `true` | PR e stato per blocco. |
| `section_screenshots` | `true` | Screenshot dell'interfaccia per blocco (gli ultimi 4). |
| `show_done_steps` | `true` | Elenca anche i passi fatti; spento, li conta soltanto. |
| `show_block_reasons` | `true` | Mostra perché un passo è fermo. |
| `show_decision_context` | `true` | Mostra il contesto sotto ogni decisione. |
| `show_status_counts` | `true` | Mostra quanti passi ci sono in ogni stato. |
| `show_progress_bars` | `true` | Mostra le barre di avanzamento. |
| `collapse_done_blocks` | `true` | Comprime i blocchi con tutti i passi fatti. |
| `show_test_notes` | `true` | Mostra la nota sotto il conteggio dei test. |

**Override per progetto.** Un file `.claude/navigator.json` nella radice del progetto, da committare, vale per tutti i colleghi. Ogni chiave assente resta quella dell'utente:

```json
{
  "enabled": true,
  "step_threshold": 8,
  "cadence": "block-done",
  "language": "it",
  "theme": "muted",
  "colors": { "accent": "#0b6e4f", "attention": "#c2410c" },
  "sections": { "screenshots": false },
  "detail": { "done_steps": false, "progress_bars": true }
}
```

Chiavi di `colors`: `background`, `surface`, `text`, `accent`, `done`, `in_progress`, `blocked`, `todo`, `attention`. Chiavi di `sections`: `requirements`, `tests`, `pr`, `screenshots`. Chiavi di `detail`: `done_steps`, `block_reasons`, `decision_context`, `status_counts`, `progress_bars`, `collapse_done_blocks`, `test_notes`.

## Comando

- `/navigator`: stato, link e ultimo errore.
- `/navigator publish`: crea o aggiorna la pagina adesso, anche sotto la soglia.
- `/navigator off` e `/navigator on`: spento e acceso solo per la sessione in corso.

## Permessi

Ogni pubblicazione passa dal controllo dei permessi dello strumento Artifact. Per non dover approvare ogni ripubblicazione, aggiungere `Artifact` alle regole `allow` delle impostazioni. Dove Artifact non c'è, per esempio con un provider diverso da claude.ai, la pagina resta solo il file locale: il plugin lo segnala e `/navigator` ne mostra il percorso.

## Sviluppo

```bash
claude plugin validate .
```

```bash
claude plugin test .
```
