window.__ModuleLoader__.load({
  id: 'dsh-sidemind',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const { useEffect, useState, useSyncExternalStore } = React

    let NativeMarkdownText
    try {
      NativeMarkdownText = require('@deepseek-ai/dsh-client-ui-primitives')?.MarkdownText
    } catch {}

    const inject = ['slots', 'commandUi', 'sidebarRightTabs', 'sidebarRight', 'remote', 'remote.commands', 'remote.session']
    const TAB_ID = 'sidemind/side'
    const TAB_KIND = 'sidemind-side'
    const CONTROL_PREFIX = '__sidemind_internal_control_v1__:'
    const MARKDOWN_LABELS = Object.freeze({
      code: Object.freeze({ copyLabel: 'Copy', copiedLabel: 'Copied' }),
      footnotes: 'Footnotes',
    })
    const btw = createBtwStore()
    const watchedTabSignals = new WeakSet()

    function apply(ctx) {
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        multiple: true,
        priority: 'extension',
        title: () => 'SideMind',
      }), 'sidemind: side tab type')

      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        inject: sessionId => ({
          sessionId,
          follow: (meta, signal, publish) => followChild(ctx, sessionId, meta, signal, publish),
          prompt: (meta, text) => sideControl(ctx, sessionId, { op: 'prompt', id: meta.childId, text }),
          close: meta => closeChild(ctx, sessionId, meta),
        }),
      }, SidePanel))

      ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
        name: 'conversation.input.overlay',
        id: 'sidemind/btw',
        order: 3,
        inject: sessionId => ({
          sessionId,
          hooks: { btw: btw.state },
          follow: (meta, signal, publish) => followChild(ctx, sessionId, meta, signal, publish),
          close: meta => closeChild(ctx, sessionId, meta),
        }),
      }, BtwOverlay))

      ctx.on('command/executed', (sessionId, name, result) => {
        if (result?.kind !== 'success' || typeof result.text !== 'string') return
        const meta = parseStartToken(result.text)
        if (!meta) return
        if (name === 'side' && meta.kind === 'side') {
          const options = { revealIfOpened: false, params: meta }
          if (typeof ctx.sidebarRight.openTabIn === 'function') ctx.sidebarRight.openTabIn(sessionId, TAB_KIND, options)
          else ctx.sidebarRight.openTab(TAB_KIND, options)
        } else if (name === 'btw' && meta.kind === 'btw') {
          btw.open(sessionId, meta)
        }
      })
    }

    function SidePanel({ useTabInfo, sessionId, follow, prompt, close }) {
      const { tab } = useTabInfo()
      const meta = normalizeMeta(tab?.navigation?.params)
      const [draft, setDraft] = useState('')
      const view = useChildView(meta, follow)

      useEffect(() => {
        const signal = tab?.signal
        if (!meta || !signal || watchedTabSignals.has(signal)) return undefined
        watchedTabSignals.add(signal)
        const onAbort = () => { void close(meta) }
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
        return undefined
      }, [tab?.signal, meta?.childId])

      if (!meta) return h('div', panelStyle, 'SideMind session metadata is unavailable.')

      const submit = async () => {
        const text = draft.trim()
        if (!text || view.sending) return
        view.setSending(true)
        try {
          await prompt(meta, text)
          setDraft('')
        } catch (error) {
          view.setError(errorMessage(error))
        } finally {
          view.setSending(false)
        }
      }

      return h('section', { style: rootStyle },
        h('div', { style: headerStyle },
          h('strong', null, 'SideMind'),
          h('span', { style: mutedStyle }, 'ephemeral · read-only tools')
        ),
        h(MessageList, { view }),
        h('div', { style: composerStyle },
          h('textarea', {
            value: draft,
            rows: 3,
            placeholder: 'Continue this side conversation…',
            onChange: event => setDraft(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            },
            style: textareaStyle,
          }),
          h('button', { type: 'button', disabled: !draft.trim() || view.sending, onClick: () => void submit(), style: buttonStyle },
            view.sending ? 'Sending…' : 'Send')
        )
      )
    }

    function BtwOverlay({ sessionId, useBtw, follow, close }) {
      const snapshot = useBtw(value => value)
      const meta = snapshot.bySession[sessionId]
      const view = useChildView(meta, follow)

      useEffect(() => {
        if (!meta) return undefined
        const onKey = event => {
          if (event.key === 'Escape') {
            void close(meta)
            btw.dismiss(sessionId, meta.childId)
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [sessionId, meta?.childId])

      if (!meta) return null
      const dismiss = () => {
        void close(meta)
        btw.dismiss(sessionId, meta.childId)
      }

      return h('aside', { style: overlayStyle, role: 'dialog', 'aria-label': 'SideMind quick question' },
        h('div', { style: headerStyle },
          h('strong', null, 'BTW'),
          h('div', null,
            h('span', { style: mutedStyle }, 'temporary · no tools'),
            h('button', { type: 'button', onClick: dismiss, style: closeStyle, 'aria-label': 'Close' }, '×')
          )
        ),
        h(MessageList, { view, compact: true })
      )
    }

    function MessageList({ view, compact = false }) {
      const rows = view.messages.map(message => h('div', {
        key: message.key,
        style: message.role === 'user' ? userMessageStyle : assistantMessageStyle,
      },
      h('div', { style: roleStyle }, message.role === 'user' ? 'You' : 'SideMind'),
      h(MarkdownBody, { text: message.text })))

      if (view.streaming) rows.push(h('div', { key: 'stream', style: assistantMessageStyle },
        h('div', { style: roleStyle }, 'SideMind'),
        h(MarkdownBody, { text: view.streaming, streaming: true })))
      if (view.error) rows.push(h('div', { key: 'error', style: errorStyle }, view.error))
      if (rows.length === 0) rows.push(h('div', { key: 'empty', style: emptyStyle }, view.loading ? 'Connecting…' : 'No side messages yet.'))
      return h('div', { style: compact ? compactMessagesStyle : messagesStyle }, rows)
    }

    function MarkdownBody({ text, streaming = false }) {
      if (NativeMarkdownText) {
        return h(NativeMarkdownText, { text, streaming, labels: MARKDOWN_LABELS })
      }
      return h('div', { style: markdownStyle }, renderMarkdownBlocks(text))
    }

    function renderMarkdownBlocks(source) {
      const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')
      const out = []
      let i = 0
      while (i < lines.length) {
        const line = lines[i]
        if (!line.trim()) { i += 1; continue }

        const fence = /^\s*```([^`]*)$/.exec(line)
        if (fence) {
          const language = fence[1].trim()
          const body = []
          i += 1
          while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++])
          if (i < lines.length) i += 1
          out.push(h('pre', { key: `code-${i}`, style: codeBlockStyle },
            language ? h('div', { style: codeLanguageStyle }, language) : null,
            h('code', null, body.join('\n'))))
          continue
        }

        const heading = /^(#{1,6})\s+(.+)$/.exec(line)
        if (heading) {
          const level = Math.min(6, heading[1].length)
          out.push(h(`h${level}`, { key: `h-${i}`, style: headingStyle(level) }, renderInline(heading[2], `h-${i}`)))
          i += 1
          continue
        }

        if (/^\s*[-*+]\s+/.test(line)) {
          const items = []
          while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
            items.push(h('li', { key: `li-${i}` }, renderInline(lines[i].replace(/^\s*[-*+]\s+/, ''), `li-${i}`)))
            i += 1
          }
          out.push(h('ul', { key: `ul-${i}`, style: listStyle }, items))
          continue
        }

        if (/^\s*\d+\.\s+/.test(line)) {
          const items = []
          while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
            items.push(h('li', { key: `oli-${i}` }, renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''), `oli-${i}`)))
            i += 1
          }
          out.push(h('ol', { key: `ol-${i}`, style: listStyle }, items))
          continue
        }

        if (/^\s*>\s?/.test(line)) {
          const quote = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''))
          out.push(h('blockquote', { key: `q-${i}`, style: quoteStyle }, renderInline(quote.join('\n'), `q-${i}`)))
          continue
        }

        const paragraph = [line]
        i += 1
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++])
        out.push(h('p', { key: `p-${i}`, style: paragraphStyle }, renderInline(paragraph.join('\n'), `p-${i}`)))
      }
      return out
    }

    function isBlockStart(line) {
      return /^\s*```/.test(line) || /^(#{1,6})\s+/.test(line) || /^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line) || /^\s*>\s?/.test(line)
    }

    function renderInline(text, keyBase) {
      const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g
      const nodes = []
      let last = 0
      let match
      let n = 0
      while ((match = pattern.exec(text))) {
        if (match.index > last) nodes.push(text.slice(last, match.index))
        const token = match[0]
        const key = `${keyBase}-${n++}`
        if (token.startsWith('`')) nodes.push(h('code', { key, style: inlineCodeStyle }, token.slice(1, -1)))
        else if (token.startsWith('**')) nodes.push(h('strong', { key }, token.slice(2, -2)))
        else if (token.startsWith('*')) nodes.push(h('em', { key }, token.slice(1, -1)))
        else {
          const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token)
          nodes.push(link ? h('a', { key, href: link[2], target: '_blank', rel: 'noreferrer', style: linkStyle }, link[1]) : token)
        }
        last = match.index + token.length
      }
      if (last < text.length) nodes.push(text.slice(last))
      return nodes
    }

    function useChildView(meta, follow) {
      const [messages, setMessages] = useState([])
      const [streaming, setStreaming] = useState('')
      const [error, setError] = useState('')
      const [loading, setLoading] = useState(Boolean(meta))
      const [sending, setSending] = useState(false)
      useEffect(() => {
        if (!meta) {
          setMessages([]); setStreaming(''); setLoading(false)
          return undefined
        }
        const abort = new AbortController()
        setMessages([]); setStreaming(''); setError(''); setLoading(true)
        void follow(meta, abort.signal, update => {
          if (update.messages) setMessages(update.messages)
          if ('streaming' in update) setStreaming(update.streaming)
          if (update.ready) setLoading(false)
        }).catch(error => {
          if (!abort.signal.aborted) { setError(errorMessage(error)); setLoading(false) }
        })
        return () => abort.abort()
      }, [meta?.childId, meta?.boundary])
      return { messages, streaming, error, loading, sending, setSending, setError }
    }

    async function followChild(ctx, parentSessionId, meta, signal, publish) {
      const events = new Map()
      let stream = ''
      const emit = () => publish({ messages: materialize(events, meta.boundary), streaming: stream, ready: true })
      for await (const frame of ctx.remote.session.follow({
        address: { kind: 'subagent', parentSessionId, childSessionId: meta.childId, mode: 'one-shot' },
        assistantStream: true,
        maxMessages: 80,
      }, signal)) {
        if (frame.type === 'snapshot') {
          events.clear()
          for (const record of frame.records ?? []) if (record?.type === 'event') events.set(record.event.seq, record.event)
          stream = streamFromBaseline(frame.assistantStream)
          emit()
        } else if (frame.type === 'event') {
          events.set(frame.event.seq, frame.event)
          if (frame.event.type === 'assistant/message') stream = ''
          emit()
        } else if (frame.type === 'assistant-stream') {
          const inner = frame.frame
          if (inner?.type === 'start') stream = ''
          else if (inner?.type === 'chunk' && inner.chunk?.type === 'text-delta') stream += inner.chunk.text ?? ''
          else if (inner?.type === 'end' && inner.outcome?.kind === 'abandoned') stream = ''
          emit()
        }
      }
    }

    function materialize(events, boundary) {
      const rows = []
      for (const event of [...events.values()].sort((a, b) => a.seq - b.seq)) {
        if (event.seq < boundary) continue
        if (event.type === 'user/message') {
          const text = contentText(event.data?.content)
          if (text) rows.push({ key: `u-${event.seq}`, role: 'user', text })
        } else if (event.type === 'assistant/message') {
          const text = contentText(event.data?.message?.content)
          if (text) rows.push({ key: `a-${event.seq}`, role: 'assistant', text })
        }
      }
      return rows
    }

    function streamFromBaseline(baseline) {
      const records = baseline?.activeAttempt?.stream
      if (!Array.isArray(records)) return ''
      let text = ''
      for (const record of records) {
        const chunk = record?.chunk ?? record
        if (chunk?.type === 'text-delta') text += chunk.text ?? ''
        if (Array.isArray(record?.texts)) text += record.texts.join('')
      }
      return text
    }

    async function sideControl(ctx, sessionId, payload) {
      const line = `/side ${CONTROL_PREFIX}${JSON.stringify(payload)}`
      const result = await ctx.remote.commands.execute(sessionId, line, [])
      if (!result.ok) throw new Error(result.error?.message ?? 'SideMind control request failed')
      const outcome = result.value?.result
      if (!outcome || outcome.kind !== 'success') throw new Error(outcome?.text ?? 'SideMind control request failed')
    }

    async function closeChild(ctx, sessionId, meta) {
      try { await sideControl(ctx, sessionId, { op: 'close', id: meta.childId }) }
      catch (error) { console.warn('[sidemind] close failed', error) }
    }

    function parseStartToken(text) {
      const match = /^sidemind:(side|btw):([0-9a-f-]+):(\d+)$/iu.exec(text.trim())
      if (!match) return undefined
      return { kind: match[1], childId: match[2], boundary: Number(match[3]) }
    }

    function normalizeMeta(value) {
      if (!value || typeof value !== 'object') return undefined
      if ((value.kind !== 'side' && value.kind !== 'btw') || typeof value.childId !== 'string' || !Number.isSafeInteger(value.boundary)) return undefined
      return value
    }

    function contentText(blocks) {
      if (!Array.isArray(blocks)) return ''
      return blocks.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n').trim()
    }

    function createBtwStore() {
      let snapshot = Object.freeze({ bySession: Object.freeze({}) })
      const listeners = new Set()
      const state = { getSnapshot: () => snapshot, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) } }
      const update = bySession => {
        snapshot = Object.freeze({ bySession: Object.freeze(bySession) })
        for (const listener of listeners) listener()
      }
      return {
        state,
        open(sessionId, meta) { update({ ...snapshot.bySession, [sessionId]: meta }) },
        dismiss(sessionId, childId) {
          if (snapshot.bySession[sessionId]?.childId !== childId) return
          const next = { ...snapshot.bySession }; delete next[sessionId]; update(next)
        },
      }
    }

    function errorMessage(error) {
      try { return error instanceof Error ? error.message : String(error) } catch { return '<unrenderable error>' }
    }

    function h(type, props, ...children) { return React.createElement(type, props, ...children) }
    function useBtwStore(store, selector) { return selector(useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)) }
    function useBtwFallback(props) { return props.useBtw ?? (selector => useBtwStore(btw.state, selector)) }

    const rawBtwOverlay = BtwOverlay
    BtwOverlay = function WrappedBtwOverlay(props) { return rawBtwOverlay({ ...props, useBtw: useBtwFallback(props) }) }

    const rootStyle = { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', fontSize: 13 }
    const panelStyle = { padding: 16, color: 'var(--dsw-alias-label-secondary)' }
    const headerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--dsw-alias-separator, rgba(127,127,127,.2))' }
    const mutedStyle = { fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #888)', marginRight: 6 }
    const messagesStyle = { flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }
    const compactMessagesStyle = { maxHeight: 360, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }
    const roleStyle = { fontSize: 10, opacity: .62, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }
    const userMessageStyle = { alignSelf: 'flex-end', maxWidth: '88%', padding: '9px 11px', borderRadius: 10, background: 'var(--dsw-alias-fill-secondary, rgba(127,127,127,.14))', overflowWrap: 'anywhere' }
    const assistantMessageStyle = { alignSelf: 'stretch', padding: '9px 2px', overflowWrap: 'anywhere', lineHeight: 1.55 }
    const errorStyle = { padding: 10, borderRadius: 8, color: 'var(--dsw-alias-error, #d55)', background: 'rgba(220,70,70,.08)' }
    const emptyStyle = { padding: 18, textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #888)' }
    const composerStyle = { padding: 10, borderTop: '1px solid var(--dsw-alias-separator, rgba(127,127,127,.2))', display: 'flex', flexDirection: 'column', gap: 8 }
    const textareaStyle = { width: '100%', resize: 'vertical', boxSizing: 'border-box', borderRadius: 8, padding: 9, font: 'inherit', color: 'inherit', background: 'var(--dsw-alias-background-secondary, rgba(127,127,127,.08))', border: '1px solid var(--dsw-alias-separator, rgba(127,127,127,.28))' }
    const buttonStyle = { alignSelf: 'flex-end', border: 0, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', font: 'inherit' }
    const overlayStyle = { position: 'absolute', left: 12, right: 12, bottom: 'calc(100% + 8px)', maxHeight: 460, overflow: 'hidden', borderRadius: 12, background: 'var(--dsw-alias-background-primary, Canvas)', boxShadow: '0 12px 40px rgba(0,0,0,.22)', border: '1px solid var(--dsw-alias-separator, rgba(127,127,127,.22))', zIndex: 20 }
    const closeStyle = { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 18, lineHeight: 1 }
    const markdownStyle = { lineHeight: 1.55, overflowWrap: 'anywhere' }
    const paragraphStyle = { margin: '0 0 8px' }
    const listStyle = { margin: '0 0 8px', paddingLeft: 22 }
    const quoteStyle = { margin: '0 0 8px', padding: '2px 0 2px 10px', borderLeft: '3px solid var(--dsw-alias-separator, rgba(127,127,127,.35))', opacity: .9, whiteSpace: 'pre-wrap' }
    const codeBlockStyle = { margin: '0 0 8px', padding: 10, overflowX: 'auto', borderRadius: 8, background: 'var(--dsw-alias-background-secondary, rgba(127,127,127,.10))', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, whiteSpace: 'pre' }
    const codeLanguageStyle = { opacity: .55, fontSize: 10, marginBottom: 6, textTransform: 'uppercase' }
    const inlineCodeStyle = { padding: '1px 4px', borderRadius: 4, background: 'var(--dsw-alias-fill-secondary, rgba(127,127,127,.14))', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
    const linkStyle = { color: 'var(--dsw-alias-link, #4b7bec)', textDecoration: 'underline' }
    const headingStyle = level => ({ margin: level <= 2 ? '10px 0 8px' : '8px 0 6px', fontSize: `${Math.max(1, 1.55 - level * .1)}em`, lineHeight: 1.25 })

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})