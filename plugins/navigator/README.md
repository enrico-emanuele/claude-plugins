# navigator

**English** · [Italiano](README.it.md)

A Claude Code plugin. On long jobs it publishes an HTML progress page as an Artifact on its own, republishes it at the same address as the work moves, and sends the link once, on the first publish. No need to ask for it in the prompt.

## What it does

- **When it starts.** When Claude's plan reaches the step threshold (5 by default). The plan is Claude's task list (`TaskCreate`/`TaskUpdate` or `TodoWrite`). When the session has no task list, Claude declares the steps through the plugin's tool.
- **What it shows.** Always: overall progress, steps grouped by block with their state (to do, in progress, done, blocked), a "Needs you" section with decisions to make and blocked steps, and the date and time of the last update. Turned on from the settings: requirements covered, tests passing, the PR and its state, screenshots of the interface. Each one appears only when it has data.
- **Blocks.** Claude groups steps by putting the block name in square brackets at the start of the step title: `[Payments] Migrate invoices`. Finished blocks are shown collapsed.
- **Extra data.** Claude passes it through the `mcp__navigator__aggiorna` tool: blocked steps, decisions, and per block the requirements, tests, PR and screenshots.
- **Publishing.** The plugin does it, not Claude. It renders the page in a fixed format, writes it to `.claude/navigator/<session>.html` (a folder that ignores itself in git) and publishes it with the Artifact tool. At the end of a turn it republishes anything left unpublished.

## Settings

Plugin options (`/config`, or `pluginConfigs` in the settings).

**Behaviour**

| Option | Default | Effect |
| --- | --- | --- |
| `attivo` | `true` | On or off. |
| `soglia_passi` | `5` | Number of steps at which the page starts. |
| `cadenza` | `passo-chiuso` | `passo-chiuso`: on every finished step. `ogni-cambio`: on every state change. `solo-blocchi`: when a whole block finishes. All three republish at once on a blocked step, a new decision and the end of the job. |

**Language and colours**

| Option | Default | Effect |
| --- | --- | --- |
| `lingua` | `en` | Language of the published page: `en` or `it`. |
| `tema` | `standard` | Starting palette: `standard`, `alto-contrasto` (high contrast) or `tenue` (muted). Each one has a light and a dark version. |
| `colore_sfondo` | theme | Page background. |
| `colore_superficie` | theme | Panels (summary and blocks). |
| `colore_testo` | theme | Text. |
| `colore_accento` | theme | Accent: links, eyebrow, labels. |
| `colore_fatto` | theme | "Done" state and progress bars. |
| `colore_in_corso` | theme | "In progress" state. |
| `colore_bloccato` | theme | "Blocked" state. |
| `colore_da_fare` | theme | "To do" state. |
| `colore_attenzione` | theme | The "Needs you" section. Follows `colore_bloccato` when only that one is set. |

Colours are hex values (`#1d5fc4`, `#fff`); empty means the theme's. A custom colour applies to both the light and the dark version. Any other value is ignored.

**Sections and detail**

| Option | Default | Effect |
| --- | --- | --- |
| `sezione_requisiti` | `true` | Requirements covered per block. |
| `sezione_test` | `true` | Tests passing per block. |
| `sezione_pr` | `true` | PR and its state per block. |
| `sezione_screenshot` | `true` | Interface screenshots per block (the last 4). |
| `mostra_passi_fatti` | `true` | Lists done steps too; off, it only counts them. |
| `mostra_motivi_blocco` | `true` | Shows why a step is blocked. |
| `mostra_contesto_decisioni` | `true` | Shows the context under each decision. |
| `mostra_conteggi_stato` | `true` | Shows how many steps are in each state. |
| `mostra_barre` | `true` | Shows the progress bars. |
| `comprimi_blocchi_chiusi` | `true` | Collapses blocks whose steps are all done. |
| `mostra_note_test` | `true` | Shows the note under the test count. |

**Per-project override.** A `.claude/navigator.json` file at the project root, committed, applies to everyone on the project. Any key left out keeps the user's value:

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

Keys of `colori`: `sfondo`, `superficie`, `testo`, `accento`, `fatto`, `in_corso`, `bloccato`, `da_fare`, `attenzione`. Keys of `dettaglio`: `passi_fatti`, `motivi_blocco`, `contesto_decisioni`, `conteggi_stato`, `barre`, `comprimi_blocchi_chiusi`, `note_test`.

## Command

- `/navigator`: state, link and last error.
- `/navigator pubblica`: creates or updates the page now, even below the threshold.
- `/navigator spegni` and `/navigator accendi`: off and on for the current session only.

## Permissions

Every publish goes through the Artifact tool's permission check. To avoid approving each republish, add `Artifact` to the `allow` rules in the settings. Where Artifact is not available, for example with a provider other than claude.ai, the page stays a local file: the plugin says so and `/navigator` shows its path.

## Development

```bash
claude plugin validate .
```

```bash
claude plugin test .
```
