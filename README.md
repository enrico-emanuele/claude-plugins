# claude-plugins

**English** · [Italiano](README.it.md)

Claude Code plugins from the Logix team.

| Plugin | What it does |
| --- | --- |
| [navigator](plugins/navigator) | On long jobs, publishes an HTML progress page as an Artifact on its own, always at the same address. |

## Install

At a Claude Code prompt, in a terminal:

```
/plugin install navigator --marketplace enrico-emanuele/claude-plugins
```

Answer `y` to add the marketplace, confirm the "user" scope with Enter, then set the options. The plugin is active right away, and in later sessions in the desktop app too.

## Update

```
claude plugin update navigator
```

then `/reload-plugins` in the open session.
