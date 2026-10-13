# claude-plugins

[English](README.md) · **Italiano**

Plugin per Claude Code di Enrico Emanuele.

| Plugin | Cosa fa |
| --- | --- |
| [navigator](plugins/navigator/README.it.md) | Nei lavori lunghi pubblica da solo una pagina HTML di avanzamento come Artifact, sempre allo stesso indirizzo. |

## Installazione

Al prompt di Claude Code, in un terminale:

```
/plugin install navigator --marketplace enrico-emanuele/claude-plugins
```

Rispondere `y` per aggiungere il marketplace, confermare l'ambito «utente» con Invio e impostare le opzioni. Il plugin è attivo subito, e nelle sessioni successive anche nell'app desktop.

## Aggiornamento

```
claude plugin update navigator
```

poi `/reload-plugins` nella sessione aperta.
