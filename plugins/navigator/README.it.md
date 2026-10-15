# navigator

[English](README.md) · **Italiano**

Plugin per Claude Code. Nei lavori lunghi pubblica da solo una pagina HTML di avanzamento come Artifact, la ripubblica allo stesso indirizzo man mano che il lavoro avanza e manda il link una volta, alla prima pubblicazione. Non serve chiederlo nel prompt.

## Installazione

Al prompt di Claude Code, in un terminale:

```
/plugin install navigator --marketplace enrico-emanuele/claude-plugins
```

Opzioni e istruzioni a Claude sono in inglese; la pagina pubblicata e i messaggi del plugin (avvisi, `/navigator`) possono essere in inglese o in italiano.

## Cosa fa

- **Quando parte.** Quando il piano di Claude arriva alla soglia di passi (5 per default). Il piano è la lista task (`TaskCreate`/`TaskUpdate` o `TodoWrite`). Se la sessione non ha una lista task, Claude dichiara i passi con lo strumento del plugin.
- **Cosa mostra.** Sempre presenti: percentuale complessiva, passi per blocco con lo stato (da fare, in corso, fatto, bloccato), la sezione «Serve da te» con decisioni da prendere e passi fermi, data e ora dell'ultimo aggiornamento. Si accendono dalle impostazioni: requisiti coperti, test che passano, PR con il suo stato, screenshot dell'interfaccia. Ognuna compare solo se ha dati. Compaiono anche, e si possono spegnere: quando è iniziato il lavoro e da quanto ogni passo è in corso o fermo (la pagina li tiene aggiornati da sola), gli ultimi 10 eventi e i sotto-agenti al lavoro.
- **Blocchi.** Claude raggruppa i passi scrivendo il nome del blocco fra quadre in testa al titolo: `[Pagamenti] Migrazione fatture`. I blocchi chiusi si mostrano compressi.
- **Lavori.** Quando tutti i passi sono fatti e Claude inizia un piano nuovo, la pagina apre un nuovo lavoro allo stesso indirizzo: passi, blocchi, decisioni ed eventi ripartono da zero. `/navigator reset` lo fa a mano.
- **Dati extra.** Claude li passa con lo strumento `mcp__navigator__update`: passi fermi, decisioni, e per ogni blocco requisiti, test, PR e screenshot.
- **Pubblicazione.** La fa il plugin, non Claude. La pagina è generata dal plugin con un formato fisso, scritta in `.claude/navigator/<sessione>.html` (cartella che si ignora da sola in git) e pubblicata con lo strumento Artifact. Gli screenshot dentro il progetto vengono caricati una volta come file accanto alla pagina, quindi una ripubblicazione manda solo quelli nuovi; quelli fuori dal progetto sono incorporati nella pagina. A fine turno, se c'è qualcosa di non pubblicato, il plugin ripubblica comunque (`publish_at_turn_end`).
- **Errori.** Se la pubblicazione viene negata, navigator va in pausa e richiede solo con `/navigator publish`. Un errore temporaneo si riprova allo stesso indirizzo; solo un artifact che non esiste più o non è aggiornabile riceve un nuovo indirizzo, e il link viene rimandato.
- **In attesa di te.** Quando Claude si ferma e aspetta una tua risposta (la fine di un turno con il piano ancora aperto e nessun sotto-agente al lavoro, una domanda alla fine di un lavoro finito, oppure una finestra `AskUserQuestion`), la pagina mostra in cima una fascia con la domanda e da quanto aspetta, e il titolo della scheda del browser comincia con «⏸ In attesa». La fascia sparisce quando Claude riprende a lavorare. Entrambi i cambi ripubblicano subito, qualunque sia la cadenza.
- **Notifiche.** Un passo fermo o una decisione nuova mandano anche una notifica push, dove la sessione ha le notifiche (`notify`).

## Impostazioni

Opzioni del plugin (`/config`, oppure `pluginConfigs` nelle impostazioni).

**Comportamento**

| Opzione | Default | Effetto |
| --- | --- | --- |
| `enabled` | `true` | Acceso o spento. |
| `step_threshold` | `5` | Numero di passi da cui parte la pagina. |
| `cadence` | `step-done` | `step-done`: a ogni passo chiuso. `every-change`: a ogni cambio di stato. `block-done`: quando un blocco intero si chiude. Con tutte e tre si ripubblica subito su passi fermi, decisioni nuove e lavoro concluso. |
| `publish_at_turn_end` | `true` | A fine turno pubblica anche quello che la cadenza ha lasciato indietro. Spento, decide solo la cadenza; una pubblicazione fallita si riprova comunque. |
| `notify` | `true` | Notifica push su un passo fermo o una decisione nuova. |

**Lingua e colori**

| Opzione | Default | Effetto |
| --- | --- | --- |
| `language` | `en` | Lingua della pagina pubblicata e dei messaggi del plugin (avvisi, `/navigator`): `en` (inglese) o `it` (italiano). |
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
| `color_waiting` | tema | La fascia mostrata mentre Claude aspetta una tua risposta. |

I colori sono esadecimali (`#1d5fc4`, `#fff`); vuoto vuol dire quello del tema. Un colore personalizzato vale per la versione chiara e per quella scura. Ogni altro valore viene ignorato.

**Sezioni e dettaglio**

| Opzione | Default | Effetto |
| --- | --- | --- |
| `section_requirements` | `true` | Requisiti coperti per blocco. |
| `section_tests` | `true` | Test che passano per blocco. |
| `section_pr` | `true` | PR e stato per blocco. |
| `section_screenshots` | `true` | Screenshot dell'interfaccia per blocco (gli ultimi 8). |
| `show_done_steps` | `true` | Elenca anche i passi fatti; spento, li conta soltanto. |
| `show_block_reasons` | `true` | Mostra perché un passo è fermo. |
| `show_decision_context` | `true` | Mostra il contesto sotto ogni decisione. |
| `show_status_counts` | `true` | Mostra quanti passi ci sono in ogni stato. |
| `show_progress_bars` | `true` | Mostra le barre di avanzamento. |
| `collapse_done_blocks` | `true` | Comprime i blocchi con tutti i passi fatti. |
| `show_test_notes` | `true` | Mostra la nota sotto il conteggio dei test. |
| `show_times` | `true` | Mostra quando è iniziato il lavoro e da quanto i passi sono in corso o fermi. |
| `show_events` | `true` | Mostra gli ultimi 10 eventi. |
| `show_agents` | `true` | Mostra i sotto-agenti al lavoro al momento della pubblicazione. |

**Override per progetto.** Un file `.claude/navigator.json` nella radice del progetto, da committare, vale per tutti i colleghi. Ogni chiave assente resta quella dell'utente:

```json
{
  "enabled": true,
  "step_threshold": 8,
  "cadence": "block-done",
  "publish_at_turn_end": false,
  "notify": true,
  "language": "it",
  "theme": "muted",
  "colors": { "accent": "#0b6e4f", "attention": "#c2410c" },
  "sections": { "screenshots": false },
  "detail": { "done_steps": false, "progress_bars": true, "events": true }
}
```

Chiavi di `colors`: `background`, `surface`, `text`, `accent`, `done`, `in_progress`, `blocked`, `todo`, `attention`, `waiting`. Chiavi di `sections`: `requirements`, `tests`, `pr`, `screenshots`. Chiavi di `detail`: `done_steps`, `block_reasons`, `decision_context`, `status_counts`, `progress_bars`, `collapse_done_blocks`, `test_notes`, `times`, `events`, `agents`.

Il file viene riletto prima di ogni pubblicazione, quindi una modifica vale senza aprire una nuova sessione (lo strumento dato a Claude, e i campi che ha, restano quelli fissati all'avvio della sessione).

## Comando

- `/navigator`: stato, link e ultimo errore.
- `/navigator publish`: crea o aggiorna la pagina adesso, anche sotto la soglia; riprende anche dopo una pubblicazione negata.
- `/navigator link`: solo il link.
- `/navigator reset`: inizia un nuovo lavoro allo stesso indirizzo.
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
