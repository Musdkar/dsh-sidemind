window.__ModuleLoader__.load({
  id: 'sidemind',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const { useEffect, useMemo, useState, useSyncExternalStore } = React

    const inject = ['slots', 'commandUi', 'sidebarRightTabs', 'sidebarRight', 'remote', 'remote.commands', 'remote.session']
    const TAB_ID = 'sidemind/side'
    const TAB_KIND = 'sidemind-side'
    const btw = createBtwStore()

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
          paramsFor: key => ctx.sidebarRight.tabDomain.occurrence(sessionId, { id: key }).navigation.getSnapshot().params,
          follow: (meta, signal, publish) => followChild(ctx, sessionId, meta, signal, publish),
          prompt: (meta, text) => sideControl(ctx, sessionId, { op: 'prompt', id: meta.childId, text }),
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

      ctx.effect(() => ctx.sidebarRight.registerCloseHandler(TAB_KIND, (sessionId, tab) => {
        const params = ctx.sidebarRight.tabDomain.occurrence(sessionId, { id: tab.id }).navigation.getSnapshot().params
        const meta = normalizeMeta(params)
        if (meta) void closeChild(ctx, sessionId, meta)
      }), 'sidemind: side close handler')

      ctx.on('command/executed', (sessionId, name, result) => {
        if (result?.kind !== 'success' || typeof result.text !== 'string') return
        const meta = parseStartToken(result.text)
        if (!meta) return
        if (name === 'side' && meta.kind === 'side') {
          ctx.sidebarRight.openTabIn(sessionId, TAB_KIND, {
            revealIfOpened: false,
            params: meta,
          })
        } else if (name === 'btw' && meta.kind === 'btw') {
          btw.open(sessionId, meta)
        }
      })
    }

    function SidePanel({ useTabInfo, sessionId, paramsFor, follow, prompt }) {
      const { tab } = useTabInfo()
      const meta = normalizeMeta(paramsFor(tab.id))
      const [draft, setDraft] = useState('')
      const view = useChildView(meta, follow)
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
      }, h('div', { style: roleStyle }, message.role === 'user' ? 'You' : 'SideMind'), message.text))
      if (view.streaming) rows.push(h('div', { key: 'stream', style: assistantMessageStyle },
        h('div', { style: roleStyle }, 'SideMind'), view.streaming))
      if (view.error) rows.push(h('div', { key: 'error', style: errorStyle }, view.error))
      if (rows.length === 0) rows.push(h('div', { key: 'empty', style: emptyStyle }, view.loading ? 'Connecting…' : 'No side messages yet.'))
      return h('div', { style: compact ? compactMessagesStyle : messagesStyle }, rows)
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
          if (!abort.signal.aborted) {
            setError(errorMessage(error))
            setLoading(false)
          }
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
        address: {
          kind: 'subagent',
          parentSessionId,
          childSessionId: meta.childId,
          mode: 'one-shot',
        },
        assistantStream: true,
        maxMessages: 80,
      }, signal)) {
        if (frame.type === 'snapshot') {
          events.clear()
          for (const record of frame.records ?? []) if (record?.type === 'event') events.set(record.event.seq, record.event)
          stream = streamFromBaseline(frame.assistantStream)
          emit()
          continue
        }
        if (frame.type === 'event') {
          events.set(frame.event.seq, frame.event)
          if (frame.event.type === 'assistant/message') stream = ''
          emit()
          continue
        }
        if (frame.type === 'assistant-stream') {
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
      const line = `/side ${JSON.stringify(payload)}`
      const result = await ctx.remote.commands.execute(sessionId, line, [])
      if (!result.ok) throw new Error(result.error?.message ?? 'SideMind control request failed')
      const outcome = result.value?.result
      if (!outcome || outcome.kind !== 'success') throw new Error(outcome?.text ?? 'SideMind control request failed')
    }

    async function closeChild(ctx, sessionId, meta) {
      try { await sideControl(ctx, sessionId, { op: 'close', id: meta.childId }) } catch (error) {
        console.warn('[sidemind] close failed', error)
      }
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
      const state = {
        getSnapshot: () => snapshot,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
      }
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

    // Slot injection maps hooks.btw to a useBtw prop; keep a fallback for direct test mounts.
    function useBtwFallback(props) {
      return props.useBtw ?? (selector => useBtwStore(btw.state, selector))
    }

    const rawBtwOverlay = BtwOverlay
    BtwOverlay = function WrappedBtwOverlay(props) {
      return rawBtwOverlay({ ...props, useBtw: useBtwFallback(props) })
    }

    const rootStyle = { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', fontSize: 13 }
    const panelStyle = { padding: 16, color: 'var(--dsw-alias-label-secondary)' }
    const headerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--dsw-alias-separator, rgba(127,127,127,.2))' }
    const mutedStyle = { fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #888)', marginRight: 6 }
    const messagesStyle = { flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }
    const compactMessagesStyle = { maxHeight: 360, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }
    const roleStyle = { fontSize: 10, opacity: .62, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }
    const userMessageStyle = { alignSelf: 'flex-end', maxWidth: '88%', padding: '9px 11px', borderRadius: 10, background: 'var(--dsw-alias-fill-secondary, rgba(127,127,127,.14))', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
    const assistantMessageStyle = { alignSelf: 'stretch', padding: '9px 2px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.55 }
    const errorStyle = { padding: 10, borderRadius: 8, color: 'var(--dsw-alias-error, #d55)', background: 'rgba(220,70,70,.08)' }
    const emptyStyle = { padding: 18, textAlign: 'center', color: 'var(--dsw-alias-label-tertiary, #888)' }
    const composerStyle = { padding: 10, borderTop: '1px solid var(--dsw-alias-separator, rgba(127,127,127,.2))', display: 'flex', flexDirection: 'column', gap: 8 }
    const textareaStyle = { width: '100%', resize: 'vertical', boxSizing: 'border-box', borderRadius: 8, padding: 9, font: 'inherit', color: 'inherit', background: 'var(--dsw-alias-background-secondary, rgba(127,127,127,.08))', border: '1px solid var(--dsw-alias-separator, rgba(127,127,127,.24))' }
    const buttonStyle = { alignSelf: 'flex-end', border: 0, borderRadius: 7, padding: '7px 12px', cursor: 'pointer' }
    const overlayStyle = { position: 'absolute', right: 16, bottom: 82, width: 'min(520px, calc(100% - 32px))', maxHeight: 'min(520px, 70vh)', overflow: 'hidden', zIndex: 40, borderRadius: 12, border: '1px solid var(--dsw-alias-separator, rgba(127,127,127,.25))', background: 'var(--dsw-alias-background-primary, #1d1d1f)', boxShadow: '0 16px 42px rgba(0,0,0,.28)', fontSize: 13 }
    const closeStyle = { border: 0, background: 'transparent', color: 'inherit', fontSize: 20, lineHeight: 1, cursor: 'pointer', verticalAlign: 'middle' }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
