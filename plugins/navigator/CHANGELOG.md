# Changelog

## 0.5.0

**New**

- When Claude stops and waits for your reply, the page shows a band across the top with the question and how long it has been waiting, and the browser tab title starts with "⏸ Waiting". It covers the end of a turn with the plan still open and no subagent at work, a question at the end of a finished job, and `AskUserQuestion` dialogs; the band goes away when Claude starts working again. Both changes republish at once, whatever the cadence. Option `color_waiting` for its colour.

## 0.4.0

**Fixes**

- A denied publish pauses navigator instead of asking again right away and again at the end of every turn. `/navigator publish` (or `/navigator on`) resumes.
- A temporary publishing error is retried at the same address. Only an artifact that no longer exists or cannot be updated gets a new address.
- Step ids from `TodoWrite` and from the `update` tool follow the step title, not its position: reordering or inserting a step keeps blockers and "step done" on the right step.
- A new plan after a finished job starts a new job at the same address instead of mixing with the old steps.
- The page footer no longer says the page refreshes on its own.
- The plugin README carries the install line.

**New**

- Screenshots inside the project are uploaded once as files next to the page; a republish sends only new ones. Up to 8 per block are shown (was 4).
- Times: when the job started, and how long each step has been in progress or blocked, kept current by the page. Option `show_times`.
- Recent events: the last 10 (steps done or blocked, decisions, blocks and job done). Option `show_events`.
- Subagents at work at publish time. Option `show_agents`.
- Push notification on a new blocked step or decision. Option `notify`.
- Option `publish_at_turn_end`: off, the end of a turn publishes only what the cadence asks for (a failed publish is still retried).
- `/navigator link` and `/navigator reset`; toasts and `/navigator` messages follow the `language` option.
- `.claude/navigator.json` is read again before every publish, so an edit counts without a new session.

## 0.3.0

- The whole plugin in English: options, command, messages, README (Italian README kept as `README.it.md`).

## 0.2.0

- Configurable page language (`en`, `it`), colour themes, custom colours and detail options. English README.

## 0.1.0

- First version: automatic progress page for long jobs (formerly "cruscotto").
