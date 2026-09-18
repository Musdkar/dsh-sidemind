# SideMind architecture

## Product contract

SideMind has two temporary surfaces sharing the same fork rule: inherit the parent only through its latest completed turn, then diverge.

### `/btw`

- Temporary, single-response side question.
- UI: compact `conversation.input.overlay` above the main composer.
- Inherits the completed parent transcript at creation time.
- Tool policy: `allow: []`.
- Dismissal disposes the child `AgentHandle`.
- Question and answer content never enter the parent conversation history.

### `/side`

- Temporary, multi-turn side conversation.
- UI: native right-sidebar tab (`sidemind-side`).
- `/side` opens an empty side thread; `/side <question>` also sends the first turn.
- Forks once from the parent completed-turn prefix.
- Later prompts are delivered directly to the child Agent's inbox.
- Tool policy: explicit known read-only allow-list; everything else is denied.
- Closing the tab disposes the child `AgentHandle`.

## Host lifecycle

The Host plugin owns an in-memory map keyed by child Session id.

```text
main Agent
  |
  | /side [question] or /btw <question> (recordInput: false)
  v
completed-turn seed
  |
  v
parent.ctx.agents.create(...)
  |
  +-- child Session (origin=subagent, in-memory)
  +-- child AgentHandle (plugin-owned)
  +-- subagent descriptor (mode=one-shot, address validation only)
  |
  +-- /btw: first prompt immediately queued
  |
  +-- /side: optional first prompt + later internal control prompts
  |
close/dismiss
  v
AgentHandle.dispose()
  -> stop child
  -> unregister child Agent
  -> remove child Session from the live store
```

The child uses a `one-shot` subagent descriptor only as an addressable Session identity for the existing Session Controller history stream. SideMind does **not** use the normal one-shot `SubagentRun` lifecycle for `/side`; it directly owns the `AgentHandle` so the same child can accept multiple turns before disposal.

Each child also receives an **agent-scoped system-prompt section** named `sidemind:fork-boundary` when the installed DSH build exposes `systemPrompt`. The section is registered through the child context's `inject(['systemPrompt'], ...)` seam, so it affects only that child. It tells the model that inherited pre-fork history is reference context rather than an active unfinished task. No synthetic user message is appended to the Session, so the inherited event boundary and transcript projection stay unchanged. Older Desktop builds that do not expose the service simply skip this extra guidance.

## Client transport

SideMind deliberately adds no custom RPC namespace.

A newly created `/side` or `/btw` returns only an opaque start token containing:

- kind (`side` or `btw`)
- child Session id
- inherited-event boundary

The client then opens DSH's existing `session.follow` stream with a subagent address:

```text
{ kind: 'subagent', parentSessionId, childSessionId, mode: 'one-shot' }
```

The inherited-event boundary lets the SideMind renderer ignore the seeded parent transcript and display only child-local user/assistant messages. `assistant-stream` frames provide live text deltas until the durable `assistant/message` arrives.

Side follow-ups and close operations use the existing DSH command transport. They are distinguished from user-entered `/side <question>` text by the private prefix:

```text
__sidemind_internal_control_v1__:
```

This prevents arbitrary user text or JSON-looking questions from being interpreted as SideMind control messages.

## Client surfaces

### Side thread

The right-sidebar body intentionally does not reproduce the parent transcript. It contains:

1. a small fork/status strip;
2. Side-local messages after the inherited boundary;
3. a compact bottom composer.

Assistant output prefers DSH's `MarkdownText`; user and assistant content fall back to SideMind's small safe renderer when that primitive is unavailable in an older Desktop build.

The actual tab occurrence `AbortSignal` owns cleanup. This is intentionally used instead of newer `sidebarRight.registerCloseHandler()` APIs so the plugin remains compatible with the tested DSH Desktop build. Collapsing the sidebar does not abort the occurrence; removing/replacing the tab does.

### BTW overlay

BTW renders as one question plus one answer rather than a generic mini-chat. It exposes dismiss and raw-Markdown copy controls and listens for `Esc` / `C` while the overlay is active.

## Main-context isolation

DSH's command subsystem records ordinary command lifecycle events. SideMind therefore cannot make the parent log literally byte-for-byte untouched while still using the public command admission path.

What SideMind guarantees is narrower and useful:

- `recordInput: false` prevents `/btw` questions, `/side` first questions, and internal Side control bodies from being written into `command/run`.
- prompt/close control calls return success without answer text.
- start calls return only the child address token needed by the browser.
- no side user/assistant messages are appended to the parent model history.
- SideMind never injects or steers side output into the parent Agent.

## Tool policy

`/btw` registers an empty allow-list after composing the child, so the model receives no ordinary tools.

`/side` intersects the child's visible tool names with a conservative built-in read-only set. This deliberately fails closed for unknown/custom tools. The current allow-list covers filesystem reads/search, Web search/fetch, Session query tools, MCP resource reads, and `lsp` when available.

## Why not continuable subagents?

DSH's official continuable-subagent path is persistence-backed so it can cold-resume. SideMind's product contract is the opposite: closing the surface should destroy the temporary branch. Directly owning an in-memory `AgentHandle` gives SideMind deterministic teardown without leaving a resumable child behind.

See [`DESIGN.md`](DESIGN.md) for the interaction references and visual rationale.
