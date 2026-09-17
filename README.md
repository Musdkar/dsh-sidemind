# SideMind

[![DeepSeek Harness Plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4b5563)](https://github.com/topics/dsh-plugin)

**Parallel conversations without polluting your main context.**

SideMind is an experimental DeepSeek Harness plugin with two intentionally different surfaces:

- `/btw` — a one-shot floating side question. It inherits the current conversation context, has no tools, and disappears when dismissed.
- `/side` — a temporary multi-turn conversation in the native right sidebar. It forks once from the current conversation and lives only until its tab is closed.

## Status

Early development (`0.0.1`). The first scaffold contains:

- a tested ephemeral lifecycle/core model;
- a working Host-side `/btw` fallback using DSH's `fork` subagent provider with `toolFilter: { allow: [] }`;
- the native `/side` client command and right-sidebar tab registration;
- the architecture contract for the upcoming floating BTW overlay and persistent in-memory Side agent transport.

The next milestone replaces the fallback `/btw` result presentation with `conversation.input.overlay` and wires the Side tab to a disposable child agent.

## Design principles

1. Main context is immutable from SideMind unless the user explicitly sends something back.
2. `/btw` is not a miniature `/side`; it is single-turn and tool-less.
3. `/side` is a true fork: after creation, parent and side histories evolve independently.
4. SideMind state is ephemeral by default. Closing the UI means disposing the underlying work.
5. Prefer DSH public extension points over DOM patches.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Development

```bash
npm test
npm run check
```

## License

MIT
