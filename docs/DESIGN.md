# SideMind interaction design

SideMind is intentionally not a second copy of the main DSH chat. Its two surfaces have different jobs.

## References

The 0.2 UI was redesigned after comparing three sources:

- **Codex CLI/TUI**: the open-source Codex implementation treats `/side` and `/btw` as an **ephemeral fork**. The fork inherits the parent context, but the side transcript starts visually at the fork boundary and disappears when the side conversation is closed. Source: [openai/codex](https://github.com/openai/codex), especially `codex-rs/tui/src/app/side.rs` and `slash_command.rs`.
- **Claude Code `/btw`**: Anthropic documents `/btw` as a **dismissible one-response overlay** that sees the existing conversation, has no tool access, stays out of the main history, supports raw-Markdown copy, and can run independently of the main turn. Source: [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode#side-questions-with-btw).
- **DeepSeek Harness**: SideMind stays inside DSH's native right-sidebar and input-overlay extension points and reuses `@deepseek-ai/dsh-client-ui-primitives` (especially `MarkdownText`) when that module is available in the installed Desktop build.

Codex Desktop itself is not open source; the public Codex CLI/TUI is the implementation reference. The public Claude Code repository does not contain the main CLI implementation, so SideMind uses Anthropic's documented behavior rather than pretending to copy unavailable source.

## `/side`: a real side thread

A Side conversation is a multi-turn branch, not a popup.

### Visual hierarchy

The DSH tab strip already supplies the tab title, so the body does not repeat a large "SideMind" card header.

Inside the tab:

1. a thin context strip: **From main thread · read-only · ephemeral**;
2. the Side-local transcript;
3. a compact composer attached to the bottom.

Inherited parent messages are model context, not Side UI. The transcript only renders events at or after the fork boundary.

### Messages

- User messages use a compact right-aligned bubble.
- Assistant messages are plain document-like Markdown, with no repeated avatar or "SideMind" role heading.
- Assistant replies expose a quiet copy action on hover/focus.
- Streaming replies use the same Markdown surface instead of a separate raw-text state.

### Composer

- `Enter`: send.
- `Shift+Enter`: newline.
- Auto-focus when a Side tab opens.
- Auto-grow until a bounded height.
- Small arrow submit affordance rather than a large text button.

### Lifetime

Closing the actual tab destroys the child Agent. Collapsing the right sidebar or switching the main DSH session does not.

SideMind keeps support for multiple independent Side tabs even though the Codex TUI usually presents one active side conversation.

## `/btw`: a quick side question

BTW is deliberately **not** rendered like a chat transcript.

It is a compact overlay anchored above the main composer:

1. small identity line: **BTW · no tools · ephemeral**;
2. the question in a muted inset row;
3. one Markdown answer;
4. a tiny shortcut footer.

Keyboard behavior in 0.2:

- `Esc`: dismiss and destroy the BTW child.
- `C`: copy the current answer as raw Markdown when focus is not in a text field.

This borrows Claude Code's one-response overlay and copy behavior, but SideMind intentionally keeps its original close-means-destroy contract. It does **not** retain the newest 20 BTW exchanges or reopen dismissed answers.

## DSH-native rendering

When available, SideMind uses DSH's own `MarkdownText`, icons, design tokens, sidebar slot, and input-overlay slot. The client keeps a small safe Markdown fallback because DSH Desktop preview releases do not all expose the exact same browser seed modules.

All SideMind-specific CSS is scoped under `.sidemind-*` and uses `--dsw-*` theme variables with neutral fallbacks. No SideMind brand color is imposed on the host theme.

## What 0.2 intentionally does not do

- No automatic merge back into Main.
- No tool access for BTW.
- No write tools in Side by default.
- No persistent Side transcript after close.
- No Claude-style BTW history carousel yet.
- No imitation of the closed-source Codex Desktop UI.
