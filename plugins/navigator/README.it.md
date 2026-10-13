# navigator

[English](README.md) · **Italiano**

Plugin per Claude Code. Nei lavori lunghi pubblica da solo una pagina HTML di avanzamento come Artifact, la ripubblica allo stesso indirizzo man mano che il lavoro avanza e manda il link una volta, alla prima pubblicazione. Non serve chiederlo nel prompt.

## Cosa fa

- **Quando parte.** Quando il piano di Claude arriva alla soglia di passi (5 per default). Il piano è la lista task (`TaskCreate`/`TaskUpdate` o `TodoWrite`). Se la sessione non ha una lista task, Claude dichiara i passi con lo strumento del plugin.
- **Cosa mostra.** Sempre presenti: percentuale complessiva, passi per blocco con lo stato (da fare, in corso, fatto, bloccato), la sezione «Serve da te» con decisioni da prendere e passi fermi, data e ora dell'ultimo aggiornamento. Si accendono dalle impostazioni: requisiti coperti, test che passano, PR con il suo stato, screenshot dell'interfaccia. Ognuna compare solo se ha dati.
- **Blocchi.** Claude raggruppa i passi scrivendo il nome del blocco fra quadre in testa al titolo: `[Pagamenti] Migrazione fatture`. I blocchi chiusi si mostrano compressi.
- **Dati extra.** Claude li passa con lo strumento `mcp__navigator__aggiorna`: passi fermi, decisioni, e per ogni blocco requisiti, test, PR e screenshot.
- **Pubblicazione.** La fa il plugin, non Claude. La pagina è generata dal plugin con un formato fisso, scritta in `.claude/navigator/<sessione>.html` (cartella che si ignora da sola in git) e pubblicata con lo strumento Artifact. A fine turno, se c'è qualcosa di non pubblicato, il plugin ripubblica comunque.

## Impostazioni

Opzioni del plugin (`/config`, oppure `pluginConfigs` nelle impostazioni).

**Comportamento**

| Opzione | Default | Effetto |
| --- | --- | --- |
| `attivo` | `true` | Acceso o spento. |
| `soglia_passi` | `5` | Numero di passi da cui parte la pagina. |
| `cadenza` | `passo-chiuso` | `passo-chiuso`: a ogni passo chiuso. `ogni-cambio`: a ogni cambio di stato. `solo-blocchi`: quando un blocco intero si chiude. Con tutte e tre si ripubblica subito su passi fermi, decisioni nuove e lavoro concluso. |

**Lingua e colori**

| Opzione | Default | Effetto |
| --- | --- | --- |
| `lingua` | `en` | Lingua della pagina pubblicata: `en` (inglese) o `it` (italiano). |
| `tema` | `standard` | Tavolozza di partenza: `standard`, `alto-contrasto` o `tenue`. Ognuna ha la versione chiara e quella scura. |
| `colore_sfondo` | tema | Sfondo della pagina. |
| `colore_superficie` | tema | Riquadri (riepilogo e blocchi). |
| `colore_testo` | tema | Testo. |
| `colore_accento` | tema | Accento: link, occhiello, etichette. |
| `colore_fatto` | tema | Stato «fatto» e barre di avanzamento. |
| `colore_in_corso` | tema | Stato «in corso». |
| `colore_bloccato` | tema | Stato «bloccato». |
| `colore_da_fare` | tema | Stato «da fare». |
| `colore_attenzione` | tema | Sezione «Serve da te». Se è impostato solo `colore_bloccato`, segue quello. |

I colori sono esadecimali (`#1d5fc4`, `#fff`); vuoto vuol dire quello del tema. Un colore personalizzato vale per la versione chiara e per quella scura. Ogni altro valore viene ignorato.

**Sezioni e dettaglio**

| Opzione | Default | Effetto |
| --- | --- | --- |
| `sezione_requisiti` | `true` | Requisiti coperti per blocco. |
| `sezione_test` | `true` | Test che passano per blocco. |
| `sezione_pr` | `true` | PR e stato per blocco. |
| `sezione_screenshot` | `true` | Screenshot dell'interfaccia per blocco (gli ultimi 4). |
| `mostra_passi_fatti` | `true` | Elenca anche i passi fatti; spento, li conta soltanto. |
| `mostra_motivi_blocco` | `true` | Mostra perché un passo è fermo. |
| `mostra_contesto_decisioni` | `true` | Mostra il contesto sotto ogni decisione. |
| `mostra_conteggi_stato` | `true` | Mostra quanti passi ci sono in ogni stato. |
| `mostra_barre` | `true` | Mostra le barre di avanzamento. |
| `comprimi_blocchi_chiusi` | `true` | Comprime i blocchi con tutti i passi fatti. |
| `mostra_note_test` | `true` | Mostra la nota sotto il conteggio dei test. |

**Override per progetto.** Un file `.claude/navigator.json` nella radice del progetto, da committare, vale per tutti i colleghi. Ogni chiave assente resta quella dell'utente:

```json
{
  "attivo": true,
  "soglia_passi": 8,
  "cadenza": "solo-blocchi",
  "lingua": "it",
  "tema": "tenue",
  "colori": { "accento": "#0b6e4f", "attenzione": "#c2410c" },
  "sezioni": { "screenshot": false },
  "dettaglio": { "passi_fatti": false, "barre": true }
}
```

Chiavi di `colori`: `sfondo`, `superficie`, `testo`, `accento`, `fatto`, `in_corso`, `bloccato`, `da_fare`, `attenzione`. Chiavi di `dettaglio`: `passi_fatti`, `motivi_blocco`, `contesto_decisioni`, `conteggi_stato`, `barre`, `comprimi_blocchi_chiusi`, `note_test`.

## Comando

- `/navigator`: stato, link e ultimo errore.
- `/navigator pubblica`: crea o aggiorna la pagina adesso, anche sotto la soglia.
- `/navigator spegni` e `/navigator accendi`: solo per la sessione in corso.

## Permessi

Ogni pubblicazione passa dal controllo dei permessi dello strumento Artifact. Per non dover approvare ogni ripubblicazione, aggiungere `Artifact` alle regole `allow` delle impostazioni. Dove Artifact non c'è, per esempio con un provider diverso da claude.ai, la pagina resta solo il file locale: il plugin lo segnala e `/navigator` ne mostra il percorso.

## Sviluppo

```bash
claude plugin validate .
```

```bash
claude plugin test .
```
