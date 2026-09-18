# SideMind

[![DeepSeek Harness Plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4b5563)](https://github.com/topics/dsh-plugin)

**Parallel conversations without polluting your main context.**

SideMind is an experimental DeepSeek Harness Web/Desktop plugin built around two deliberately different interaction models:

- `/side [question]` — open an ephemeral **multi-turn side thread** in DSH's native right sidebar. It forks from the latest completed main turn, supports read-only tools, and is destroyed when its tab is actually closed.
- `/btw <question>` — ask an ephemeral **single-response side question** in a compact overlay above the main composer. It sees the current completed conversation context, has no tools, and is destroyed when dismissed.

## 0.2.2

0.2 is a UI/interaction rewrite informed by the open-source Codex TUI `/side`, Grok Build's open-source `/btw` panel, and DSH's own UI primitives. 0.2.1 added a child-scoped fork-boundary system prompt; 0.2.2 replaces the BTW mini-chat chrome with Grok's compact bordered-panel interaction.

### Side

- no duplicate giant SideMind header inside the native DSH tab;
- a thin `From main thread · read-only · ephemeral` context strip;
- inherited parent history stays model-visible but is hidden from the Side transcript;
- compact user bubbles + document-style assistant Markdown;
- DSH `MarkdownText` when available, with a compatibility fallback;
- copy-as-Markdown action on assistant replies;
- auto-focused, auto-growing composer;
- `Enter` sends and `Shift+Enter` inserts a newline;
- `/side why is this implemented this way?` creates the branch and sends the first question immediately.

### BTW

- Grok Build-style bordered panel directly above the composer;
- the top border itself carries `/btw <question>` and an always-visible `[Esc]` hint;
- Loading / Done / Error states with no duplicate question card, product header, or footer;
- DSH Markdown rendering for the answer;
- bounded internal scrolling for long replies; completed long answers accept Arrow/Page/Home/End navigation;
- `Esc` closes the panel and destroys the child;
- no tools and no write-back to Main;
- intentionally **does not** persist dismissed BTW answers into Main scrollback.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the reference analysis and interaction rationale.

## Isolation model

1. Both surfaces inherit only through the latest completed parent turn and then diverge.
2. SideMind never sends side answers back into the parent Agent automatically.
3. Side prompt bodies live only in the ephemeral child Session.
4. `/btw` exposes no model tools.
5. `/side` allows only a conservative known read-only tool set; unknown/custom tools fail closed.
6. Closing the corresponding UI disposes the owning child `AgentHandle` and removes the in-memory child Session.
7. SideMind deliberately avoids DSH's persistence-backed continuable-subagent path so close still means destroy.

The parent Session still records ordinary DSH command lifecycle events for command admission. SideMind uses `recordInput: false`, and successful internal control calls contain neither the side prompt body nor the side answer in those parent command records.

## Compatibility

DSH is still a rapidly changing developer preview. SideMind avoids newer sidebar close-handler APIs and watches the tab occurrence `AbortSignal` instead, which works with the older DSH build currently shipped in the tested DSH Desktop.

The browser client prefers DSH-native UI primitives but keeps compatibility fallbacks for Desktop builds that expose a smaller client-module surface.

## Development

```bash
npm test
npm run check
```

See:

- [Architecture](docs/ARCHITECTURE.md)
- [Interaction design](docs/DESIGN.md)

## License

MIT
