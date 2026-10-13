# navigator

Plugin per Claude Code. Nei lavori lunghi crea da solo una pagina HTML di avanzamento come Artifact, lo ripubblica sempre allo stesso indirizzo e manda il link una volta, alla prima pubblicazione. Non serve chiederlo nel prompt.

## Cosa fa

- **Quando parte.** Quando il piano di Claude arriva alla soglia di passi (5 per default). Il piano è la lista task (`TaskCreate`/`TaskUpdate` o `TodoWrite`). Se la sessione non ha una lista task, Claude dichiara i passi con lo strumento del plugin.
- **Cosa mostra.** Sempre presenti: percentuale complessiva, passi per blocco con lo stato (da fare, in corso, fatto, bloccato), la sezione «Serve da te» con decisioni da prendere e passi fermi, data e ora dell'ultimo aggiornamento. Si accendono da configurazione: requisiti coperti, test che passano, PR con il suo stato, screenshot dell'interfaccia. Ognuna compare solo se ha dati.
- **Blocchi.** Claude raggruppa i passi scrivendo il nome del blocco fra quadre in testa al titolo: `[Pagamenti] Migrazione fatture`. I blocchi chiusi si mostrano compressi.
- **Dati extra.** Claude li passa con lo strumento `mcp__navigator__aggiorna`: passi fermi, decisioni, e per ogni blocco requisiti, test, PR e screenshot.
- **Pubblicazione.** La fa il plugin, non Claude. La pagina è generata dal plugin con un formato fisso, scritta in `.claude/navigator/<sessione>.html` (cartella che si ignora da sola in git) e pubblicata con lo strumento Artifact. A fine turno, se c'è qualcosa di non pubblicato, il plugin ripubblica comunque.

## Configurazione

Opzioni del plugin (`/config`, oppure `pluginConfigs` nelle impostazioni):

| Opzione | Default | Effetto |
| --- | --- | --- |
| `attivo` | `true` | Acceso o spento. |
| `soglia_passi` | `5` | Numero di passi da cui parte il navigator. |
| `cadenza` | `passo-chiuso` | `passo-chiuso`: a ogni passo chiuso. `ogni-cambio`: a ogni cambio di stato. `solo-blocchi`: quando un blocco intero si chiude. Con tutte e tre si ripubblica subito su passi fermi, decisioni nuove e lavoro concluso. |
| `sezione_requisiti` | `true` | Requisiti coperti per blocco. |
| `sezione_test` | `true` | Test che passano per blocco. |
| `sezione_pr` | `true` | PR e stato per blocco. |
| `sezione_screenshot` | `true` | Screenshot dell'interfaccia per blocco (gli ultimi 4). |

**Override per progetto.** Un file `.claude/navigator.json` nella radice del progetto, da committare, vale per tutti i colleghi. Ogni chiave assente resta quella dell'utente:

```json
{
  "attivo": true,
  "soglia_passi": 8,
  "cadenza": "solo-blocchi",
  "sezioni": { "screenshot": false }
}
```

## Comando

- `/navigator`: stato, link e ultimo errore.
- `/navigator pubblica`: crea o aggiorna il navigator adesso, anche sotto la soglia.
- `/navigator spegni` e `/navigator accendi`: solo per la sessione in corso.

## Permessi

Ogni pubblicazione passa dal controllo dei permessi dello strumento Artifact. Per non dover approvare ogni ripubblicazione, aggiungere `Artifact` alle regole `allow` delle impostazioni. Dove Artifact non c'è, per esempio con un provider diverso da claude.ai, il navigator resta solo il file locale: il plugin lo segnala e `/navigator` ne mostra il percorso.

## Sviluppo

```bash
claude plugin validate .
```

```bash
claude plugin test .
```
