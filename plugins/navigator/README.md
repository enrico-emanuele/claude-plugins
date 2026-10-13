# navigator

**English** · [Italiano](README.it.md)

A Claude Code plugin. On long jobs it publishes an HTML progress page as an Artifact on its own, republishes it at the same address as the work moves, and sends the link once, on the first publish. No need to ask for it in the prompt.

## Install

At a Claude Code prompt, in a terminal:

```
/plugin install navigator --marketplace enrico-emanuele/claude-plugins
```

## What it does

- **When it starts.** When Claude's plan reaches the step threshold (5 by default). The plan is Claude's task list (`TaskCreate`/`TaskUpdate` or `TodoWrite`). When the session has no task list, Claude declares the steps through the plugin's tool.
- **What it shows.** Always: overall progress, steps grouped by block with their state (to do, in progress, done, blocked), a "Needs you" section with decisions to make and blocked steps, and the date and time of the last update. Turned on from the settings: requirements covered, tests passing, the PR and its state, screenshots of the interface. Each one appears only when it has data. Also shown, and each can be turned off: when the job started and how long each step has been in progress or blocked (kept current by the page itself), the last 10 events, and the subagents at work.
- **Blocks.** Claude groups steps by putting the block name in square brackets at the start of the step title: `[Payments] Migrate invoices`. Finished blocks are shown collapsed.
- **Jobs.** When every step is done and Claude starts a new plan, the page starts a new job at the same address: steps, blocks, decisions and events start over. `/navigator reset` does it by hand.
- **Extra data.** Claude passes it through the `mcp__navigator__update` tool: blocked steps, decisions, and per block the requirements, tests, PR and screenshots.
- **Publishing.** The plugin does it, not Claude. It renders the page in a fixed format, writes it to `.claude/navigator/<session>.html` (a folder that ignores itself in git) and publishes it with the Artifact tool. Screenshots inside the project go up once as files next to the page, so a republish sends only new ones; those outside the project are embedded in the page. At the end of a turn it republishes anything left unpublished (`publish_at_turn_end`).
- **Failures.** If publishing is denied, navigator pauses and asks again only on `/navigator publish`. A temporary error is retried at the same address; only an artifact that no longer exists or cannot be updated gets a new address, and its link is sent again.
- **Notifications.** A new blocked step or decision also sends a push notification, where the session has notifications (`notify`).

## Settings

Plugin options (`/config`, or `pluginConfigs` in the settings).

**Behaviour**

| Option | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | On or off. |
| `step_threshold` | `5` | Number of steps at which the page starts. |
| `cadence` | `step-done` | `step-done`: on every finished step. `every-change`: on every state change. `block-done`: when a whole block finishes. All three republish at once on a blocked step, a new decision and the end of the job. |
| `publish_at_turn_end` | `true` | At the end of each turn, also publishes what the cadence left unpublished. Off, only the cadence decides; a failed publish is still retried. |
| `notify` | `true` | Push notification on a new blocked step or decision. |

**Language and colours**

| Option | Default | Effect |
| --- | --- | --- |
| `language` | `en` | Language of the published page and of navigator's own messages (toasts, `/navigator`): `en` or `it`. |
| `theme` | `standard` | Starting palette: `standard`, `high-contrast` or `muted`. Each one has a light and a dark version. |
| `color_background` | theme | Page background. |
| `color_surface` | theme | Panels (summary and blocks). |
| `color_text` | theme | Text. |
| `color_accent` | theme | Accent: links, eyebrow, labels. |
| `color_done` | theme | "Done" state and progress bars. |
| `color_in_progress` | theme | "In progress" state. |
| `color_blocked` | theme | "Blocked" state. |
| `color_todo` | theme | "To do" state. |
| `color_attention` | theme | The "Needs you" section. Follows `color_blocked` when only that one is set. |

Colours are hex values (`#1d5fc4`, `#fff`); empty means the theme's. A custom colour applies to both the light and the dark version. Any other value is ignored.

**Sections and detail**

| Option | Default | Effect |
| --- | --- | --- |
| `section_requirements` | `true` | Requirements covered per block. |
| `section_tests` | `true` | Tests passing per block. |
| `section_pr` | `true` | PR and its state per block. |
| `section_screenshots` | `true` | Interface screenshots per block (the last 8). |
| `show_done_steps` | `true` | Lists done steps too; off, it only counts them. |
| `show_block_reasons` | `true` | Shows why a step is blocked. |
| `show_decision_context` | `true` | Shows the context under each decision. |
| `show_status_counts` | `true` | Shows how many steps are in each state. |
| `show_progress_bars` | `true` | Shows the progress bars. |
| `collapse_done_blocks` | `true` | Collapses blocks whose steps are all done. |
| `show_test_notes` | `true` | Shows the note under the test count. |
| `show_times` | `true` | Shows when the job started and how long steps have been in progress or blocked. |
| `show_events` | `true` | Shows the last 10 events. |
| `show_agents` | `true` | Shows the subagents at work when the page is published. |

**Per-project override.** A `.claude/navigator.json` file at the project root, committed, applies to everyone on the project. Any key left out keeps the user's value:

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

Keys of `colors`: `background`, `surface`, `text`, `accent`, `done`, `in_progress`, `blocked`, `todo`, `attention`. Keys of `sections`: `requirements`, `tests`, `pr`, `screenshots`. Keys of `detail`: `done_steps`, `block_reasons`, `decision_context`, `status_counts`, `progress_bars`, `collapse_done_blocks`, `test_notes`, `times`, `events`, `agents`.

The file is read again before every publish, so an edit counts without a new session (the tool Claude is given, and which fields it has, are still set when the session starts).

## Command

- `/navigator`: state, link and last error.
- `/navigator publish`: creates or updates the page now, even below the threshold; also resumes after a denied publish.
- `/navigator link`: the link alone.
- `/navigator reset`: starts a new job at the same address.
- `/navigator off` and `/navigator on`: for the current session only.

## Permissions

Every publish goes through the Artifact tool's permission check. To avoid approving each republish, add `Artifact` to the `allow` rules in the settings. Where Artifact is not available, for example with a provider other than claude.ai, the page stays a local file: the plugin says so and `/navigator` shows its path.

## Development

```bash
claude plugin validate .
```

```bash
claude plugin test .
```
