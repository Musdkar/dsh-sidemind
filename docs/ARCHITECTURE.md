# SideMind architecture

## Product contract

SideMind has two temporary surfaces sharing the same fork rule: inherit the parent only through its latest completed turn, then diverge.

### `/btw`

- Temporary, single-turn side question.
- UI: `conversation.input.overlay`.
- Inherits the completed parent transcript at creation time.
- Tool policy: `allow: []`.
- Dismissal disposes the child AgentHandle.
- Question and answer content never enter the parent conversation history.

### `/side`

- Temporary, multi-turn side conversation.
- UI: native right-sidebar tab (`sidemind-side`).
- Forks once from the parent completed-turn prefix.
- Later prompts are delivered directly to the child Agent's inbox.
- Tool policy: explicit known read-only allow-list; everything else is denied.
- Closing the tab disposes the child AgentHandle.

## Host lifecycle

The Host plugin owns an in-memory map keyed by child Session id.

```text
main Agent
  |
  | /side or /btw (recordInput: false)
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
  +-- /side: later prompts arrive via internal /side control calls
  |
close/dismiss
  v
AgentHandle.dispose()
  -> stop child
  -> unregister child Agent
  -> remove child Session from the live store
```

The child uses a `one-shot` subagent descriptor only as an addressable Session identity for the existing Session Controller history stream. SideMind does **not** use the normal one-shot `SubagentRun` lifecycle for `/side`; it directly owns the AgentHandle so the same child can accept multiple turns before disposal.

## Client transport

SideMind deliberately adds no custom RPC namespace.

The user-visible `/side` and `/btw` commands return only an opaque start token containing:

- kind (`side` or `btw`)
- child Session id
- inherited-event boundary

The client then opens DSH's existing `session.follow` stream with a subagent address:

```text
{ kind: 'subagent', parentSessionId, childSessionId, mode: 'one-shot' }
```

The inherited-event boundary lets the SideMind renderer ignore the seeded parent transcript and display only child-local user/assistant messages. `assistant-stream` frames provide live text deltas until the durable `assistant/message` arrives.

## Main-context isolation

DSH's command subsystem always records ordinary command lifecycle events. SideMind therefore cannot make the parent log literally byte-for-byte untouched while still using the public command admission path.

What SideMind guarantees is narrower and useful:

- `recordInput: false` prevents `/btw` questions and internal `/side` prompt bodies from being written into `command/run`.
- prompt/close control calls return success without answer text.
- start calls return only the child address token needed by the browser.
- no side user/assistant messages are appended to the parent model history.
- SideMind never injects or steers side output into the parent Agent.

## Tool policy

`/btw` registers an empty allow-list after composing the child, so the model receives no ordinary tools.

`/side` intersects the child's visible tool names with a conservative built-in read-only set. This deliberately fails closed for unknown/custom tools. The current allow-list covers filesystem reads/search, Web search/fetch, Session query tools, MCP resource reads, and `lsp` when available.

## Why not continuable subagents?

DSH's official continuable-subagent path is persistence-backed so it can cold-resume. SideMind's product contract is the opposite: closing the surface should destroy the temporary branch. Directly owning an in-memory AgentHandle gives SideMind deterministic teardown without leaving a resumable child behind.
