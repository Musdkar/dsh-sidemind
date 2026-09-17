# SideMind architecture

## Product contract

SideMind has two surfaces with one shared context-snapshot model.

### `/btw`

- Temporary, single-turn side question.
- Uses the current main conversation as inherited context.
- No tools.
- UI target: `conversation.input.overlay`.
- Closing the overlay destroys the side-question state.
- Never writes its question or answer into the main conversation.

### `/side`

- Temporary, multi-turn side conversation.
- Forks from the main conversation at creation time.
- Parent and child stop synchronizing after the fork.
- UI target: a native right-sidebar tab (`sidemind-side`).
- Default tool policy: read-only.
- Closing the tab aborts work, disposes the child agent, and removes all plugin-owned state.
- Nothing is persisted to the normal DSH session history.

## Shared primitive: Context Snapshot

A snapshot records the source session plus the stable fork boundary. Both `/btw`
and `/side` must derive their first model turn from the exact same snapshot semantics.

## Lifecycle

```text
main session
    |
    +-- snapshot -- /btw  -> one turn -> close/dismiss -> dispose
    |
    +-- snapshot -- /side -> N turns  -> close tab       -> dispose
```

## Main-context isolation

SideMind never writes back automatically. A future `Send to Main` affordance is an
explicit user action and is the only supported bridge back to the parent.

## DSH integration points

- `/side`: client `ctx.commandUi` action -> `ctx.sidebarRight.openTab(...)`
- Side body: `ctx.sidebarRightTabs.register(...)` + `sidebar.right.pane.tab`
- `/btw` target: `conversation.input.overlay`
- Context fork: DSH fork/subagent/session primitives
- Tool policy: `/btw` allow none; `/side` read-only guard
