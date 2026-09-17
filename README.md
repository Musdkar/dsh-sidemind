# SideMind

[![DeepSeek Harness Plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4b5563)](https://github.com/topics/dsh-plugin)

**Parallel conversations without polluting your main context.**

SideMind is an experimental DeepSeek Harness Web plugin with two intentionally different surfaces:

- `/btw <question>` — a temporary one-turn side question shown in a floating overlay. It inherits the main conversation up to the latest completed turn, exposes no tools, and is destroyed when dismissed.
- `/side` — a temporary multi-turn conversation in the native right sidebar. It forks once from the current conversation, allows a conservative read-only tool set, and is destroyed when its tab is closed.

## Status

`0.1.0` connects the Host and Web halves end-to-end:

- Host-side ephemeral child Agents created with DSH's public Agent/Session primitives;
- completed-turn fork semantics, so parent and side histories diverge after creation;
- `/btw` with an empty tool allow-list;
- `/side` with an explicit read-only tool allow-list;
- native `session.follow` history + assistant-stream transport for the SideMind UI;
- a right-sidebar `/side` surface and `conversation.input.overlay` `/btw` surface;
- close/dismiss cleanup through the owning `AgentHandle.dispose()`.

The main Session does retain ordinary `command/run` and `command/done` lifecycle events for `/side` and `/btw`, because those are DSH's command admission records. SideMind sets `recordInput: false`, and successful control operations put no side prompt or answer text in those records. A newly-created child id and fork boundary are returned in the start command result so the Web client can address the child stream.

## Isolation model

1. SideMind never sends side answers back into the parent Agent automatically.
2. Side prompt bodies live only in the ephemeral child Session.
3. `/btw` has no model tools.
4. `/side` currently allows only known read-only tools (`read`, `read_image`, `glob`, `grep`, Web read/search, Session query tools, MCP resource reads, and `lsp` when present). Unknown/custom tools are denied by default.
5. Closing the corresponding UI disposes the child Agent and removes its in-memory Session from the live registry/store.
6. SideMind does not use DSH continuable-subagent persistence, specifically to preserve close-means-destroy semantics.

## Development

```bash
npm test
npm run check
```

This repository targets the rapidly changing DSH developer preview. `0.1.0` was written against the current public Agent, Session Controller, Commands, sidebar, and overlay APIs; runtime integration should be rechecked when upgrading DSH across breaking preview releases.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the lifecycle and transport details.

## License

MIT
