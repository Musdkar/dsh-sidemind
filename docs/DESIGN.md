# SideMind interaction design

SideMind is intentionally not a second copy of the main DSH chat. Its two surfaces have different jobs.

## References

The 0.2 UI was redesigned after comparing three sources:

- **Codex CLI/TUI**: the open-source Codex implementation treats `/side` and `/btw` as an **ephemeral fork**. The fork inherits the parent context, but the side transcript starts visually at the fork boundary and disappears when the side conversation is closed. Source: [openai/codex](https://github.com/openai/codex), especially `codex-rs/tui/src/app/side.rs` and `slash_command.rs`.
- **Grok Build `/btw`**: the open-source implementation renders a compact rounded panel immediately above the prompt. The question is embedded in the top border as `/btw <question>`, `[Esc]` is always reserved on the right, the body has Loading / Done / Error states, completed Markdown is internally scrollable, and a finished long answer can take keyboard focus for navigation. Source: [xai-org/grok-build](https://github.com/xai-org/grok-build), especially `crates/codegen/xai-grok-pager/src/views/btw_overlay.rs` and `scrollback/blocks/btw.rs`.
- **Claude Code `/btw`** remains a semantic comparison: one side question that stays outside the main conversation and does not use tools. SideMind no longer uses Claude's presentation as its primary visual reference.
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

The child also receives a scoped fork-boundary system instruction (when the installed DSH build exposes that service): inherited history is reference material, not an instruction to resume unfinished parent work. This mirrors the key semantic guard in Codex's open-source side implementation without inserting a fake visible chat message.

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

## `/btw`: a Grok-style inline panel

BTW is deliberately **not** rendered like a mini chat.

The 0.2.2 surface follows Grok Build's open-source panel structure:

1. one rounded border anchored just above the main composer;
2. `/btw <question>` embedded into the top border and truncated before it can cover the close hint;
3. `[Esc]` permanently visible on the top-right edge;
4. a body with exactly one state: **Answering…**, the Markdown answer, or an error;
5. bounded body height with internal scrolling for long replies;
6. after a completed long answer, focus moves to the panel so Arrow/Page/Home/End navigation works without moving the main page.

Unlike Grok Build, SideMind does **not** commit a dismissed answer into the main scrollback. Dismissal still destroys the child Agent and its temporary Session, preserving SideMind's original close-means-destroy contract.

Grok Build also supports `/btw` embedded mid-message. SideMind 0.2.2 does not yet intercept arbitrary DSH composer text, so its public syntax remains a leading `/btw <question>` command.

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
