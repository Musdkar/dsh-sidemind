window.__ModuleLoader__.load({
  id: 'dsh-sidemind',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const { useEffect, useRef, useState, useSyncExternalStore } = React

    let primitives = {}
    try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') ?? {} } catch {}

    const NativeMarkdownText = primitives.MarkdownText
    const BranchIcon = primitives.IconBranchOutline16
    const CloseIcon = primitives.IconCloseOutline16
    const CopyIcon = primitives.IconCopyOutline16

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
      ctx.effect(() => installStyles(), 'sidemind: styles')

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        multiple: true,
        priority: 'extension',
        title: () => 'Side',
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
      const textareaRef = useRef(null)
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

      useEffect(() => {
        if (!meta) return
        const timer = setTimeout(() => textareaRef.current?.focus(), 40)
        return () => clearTimeout(timer)
      }, [meta?.childId])

      if (!meta) return h('div', { className: 'sidemind-empty sidemind-empty-error' }, 'Side session metadata is unavailable.')

      const resizeComposer = element => {
        if (!element) return
        element.style.height = '0px'
        element.style.height = `${Math.min(160, Math.max(38, element.scrollHeight))}px`
      }

      const submit = async () => {
        const text = draft.trim()
        if (!text || view.sending) return
        view.setSending(true)
        try {
          await prompt(meta, text)
          setDraft('')
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.style.height = '38px'
              textareaRef.current.focus()
            }
          })
        } catch (error) {
          view.setError(errorMessage(error))
        } finally {
          view.setSending(false)
        }
      }

      return h('section', { className: 'sidemind-side' },
        h('div', { className: 'sidemind-contextbar' },
          h('div', { className: 'sidemind-context-main' },
            icon(BranchIcon, '↳'),
            h('span', { className: 'sidemind-context-title' }, 'From main thread')
          ),
          h('div', { className: 'sidemind-context-meta' },
            h('span', null, 'read-only'),
            h('span', { 'aria-hidden': true }, '·'),
            h('span', null, 'ephemeral')
          )
        ),
        h(SideTranscript, { view }),
        h('div', { className: 'sidemind-composer-shell' },
          h('div', { className: 'sidemind-composer' },
            h('textarea', {
              ref: textareaRef,
              className: 'sidemind-composer-input',
              value: draft,
              rows: 1,
              placeholder: 'Ask in this side thread…',
              'aria-label': 'Side conversation message',
              onChange: event => {
                setDraft(event.target.value)
                resizeComposer(event.target)
              },
              onKeyDown: event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                  event.preventDefault()
                  void submit()
                }
              },
            }),
            h('div', { className: 'sidemind-composer-footer' },
              h('span', { className: 'sidemind-keyhint' }, 'Enter send · Shift+Enter newline'),
              h('button', {
                type: 'button',
                className: 'sidemind-send',
                disabled: !draft.trim() || view.sending,
                onClick: () => void submit(),
                'aria-label': 'Send message',
                title: 'Send',
              }, view.sending ? h('span', { className: 'sidemind-spinner', 'aria-hidden': true }) : '↑')
            )
          )
        )
      )
    }

    function SideTranscript({ view }) {
      const scrollerRef = useRef(null)
      const [copiedKey, setCopiedKey] = useState('')

      useEffect(() => {
        const element = scrollerRef.current
        if (!element) return
        element.scrollTop = element.scrollHeight
      }, [view.messages.length, view.streaming])

      const copyMessage = async message => {
        await copyText(message.text)
        setCopiedKey(message.key)
        setTimeout(() => setCopiedKey(current => current === message.key ? '' : current), 1200)
      }

      const rows = view.messages.map(message => {
        if (message.role === 'user') {
          return h('div', { className: 'sidemind-turn sidemind-turn-user', key: message.key },
            h('div', { className: 'sidemind-user-bubble' }, h(MarkdownBody, { text: message.text }))
          )
        }
        return h('div', { className: 'sidemind-turn sidemind-turn-assistant', key: message.key },
          h('div', { className: 'sidemind-assistant-body' }, h(MarkdownBody, { text: message.text })),
          h('div', { className: 'sidemind-message-actions' },
            h('button', {
              type: 'button',
              className: 'sidemind-icon-button',
              onClick: () => void copyMessage(message),
              'aria-label': 'Copy response as Markdown',
              title: copiedKey === message.key ? 'Copied' : 'Copy Markdown',
            }, copiedKey === message.key ? h('span', { className: 'sidemind-copied' }, 'Copied') : icon(CopyIcon, '⧉'))
          )
        )
      })

      if (view.streaming) {
        rows.push(h('div', { className: 'sidemind-turn sidemind-turn-assistant', key: 'stream' },
          h('div', { className: 'sidemind-assistant-body' }, h(MarkdownBody, { text: view.streaming, streaming: true }))
        ))
      } else if (view.loading && rows.length === 0) {
        rows.push(h('div', { className: 'sidemind-empty', key: 'loading' },
          h('span', { className: 'sidemind-thinking-dot' }),
          h('span', null, 'Opening side thread…')
        ))
      } else if (!view.loading && rows.length === 0) {
        rows.push(h('div', { className: 'sidemind-empty', key: 'empty' },
          h('div', { className: 'sidemind-empty-icon' }, icon(BranchIcon, '↳')),
          h('strong', null, 'A clean branch from the current context'),
          h('span', null, 'Ask anything here without adding it to the main thread.')
        ))
      }

      if (view.error) rows.push(h('div', { className: 'sidemind-inline-error', key: 'error' }, view.error))

      return h('div', { className: 'sidemind-transcript', ref: scrollerRef }, rows)
    }

    function BtwOverlay({ sessionId, useBtw, follow, close }) {
      const snapshot = useBtw(value => value)
      const meta = snapshot.bySession[sessionId]
      const view = useChildView(meta, follow)
      const [copied, setCopied] = useState(false)
      const scrollerRef = useRef(null)

      const dismiss = () => {
        if (!meta) return
        void close(meta)
        btw.dismiss(sessionId, meta.childId)
      }

      const question = firstUserText(view)
      const answer = latestAssistantText(view)

      const copyAnswer = async () => {
        if (!answer) return
        await copyText(answer)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }

      useEffect(() => {
        if (!meta) return undefined
        const onKey = event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            dismiss()
            return
          }
          const target = event.target
          const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
          if (!typing && event.key.toLowerCase() === 'c' && answer) {
            event.preventDefault()
            void copyAnswer()
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [sessionId, meta?.childId, answer])

      useEffect(() => {
        const element = scrollerRef.current
        if (!element) return
        element.scrollTop = element.scrollHeight
      }, [answer])

      if (!meta) return null

      return h('aside', { className: 'sidemind-btw', role: 'dialog', 'aria-label': 'Side question' },
        h('div', { className: 'sidemind-btw-header' },
          h('div', { className: 'sidemind-btw-identity' },
            h('span', { className: 'sidemind-btw-title' }, 'BTW'),
            h('span', { className: 'sidemind-btw-meta' }, 'no tools · ephemeral')
          ),
          h('div', { className: 'sidemind-btw-actions' },
            h('button', {
              type: 'button',
              className: 'sidemind-icon-button',
              disabled: !answer,
              onClick: () => void copyAnswer(),
              'aria-label': 'Copy answer as Markdown',
              title: copied ? 'Copied' : 'Copy Markdown',
            }, copied ? h('span', { className: 'sidemind-copied' }, 'Copied') : icon(CopyIcon, '⧉')),
            h('button', {
              type: 'button',
              className: 'sidemind-icon-button',
              onClick: dismiss,
              'aria-label': 'Close side question',
              title: 'Close',
            }, icon(CloseIcon, '×'))
          )
        ),
        h('div', { className: 'sidemind-btw-scroll', ref: scrollerRef },
          question ? h('div', { className: 'sidemind-btw-question' }, h(MarkdownBody, { text: question })) : null,
          answer
            ? h('div', { className: 'sidemind-btw-answer' }, h(MarkdownBody, { text: answer, streaming: Boolean(view.streaming) }))
            : h('div', { className: 'sidemind-btw-pending' },
                h('span', { className: 'sidemind-thinking-dot' }),
                h('span', null, view.error || 'Thinking…')
              )
        ),
        h('div', { className: 'sidemind-btw-footer' },
          h('span', null, 'Esc close'),
          h('span', { 'aria-hidden': true }, '·'),
          h('span', null, 'C copy Markdown')
        )
      )
    }

    function MarkdownBody({ text, streaming = false }) {
      if (NativeMarkdownText) return h(NativeMarkdownText, { text, streaming, labels: MARKDOWN_LABELS })
      return h('div', { className: 'sidemind-fallback-markdown' }, renderMarkdownBlocks(text))
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
          out.push(h('pre', { key: `code-${i}` }, language ? h('div', { className: 'sidemind-code-language' }, language) : null, h('code', null, body.join('\n'))))
          continue
        }

        const heading = /^(#{1,6})\s+(.+)$/.exec(line)
        if (heading) {
          const level = Math.min(6, heading[1].length)
          out.push(h(`h${level}`, { key: `h-${i}` }, renderInline(heading[2], `h-${i}`)))
          i += 1
          continue
        }

        if (/^\s*[-*+]\s+/.test(line)) {
          const items = []
          while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
            items.push(h('li', { key: `li-${i}` }, renderInline(lines[i].replace(/^\s*[-*+]\s+/, ''), `li-${i}`)))
            i += 1
          }
          out.push(h('ul', { key: `ul-${i}` }, items))
          continue
        }

        if (/^\s*\d+\.\s+/.test(line)) {
          const items = []
          while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
            items.push(h('li', { key: `oli-${i}` }, renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''), `oli-${i}`)))
            i += 1
          }
          out.push(h('ol', { key: `ol-${i}` }, items))
          continue
        }

        if (/^\s*>\s?/.test(line)) {
          const quote = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''))
          out.push(h('blockquote', { key: `q-${i}` }, renderInline(quote.join('\n'), `q-${i}`)))
          continue
        }

        const paragraph = [line]
        i += 1
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++])
        out.push(h('p', { key: `p-${i}` }, renderInline(paragraph.join('\n'), `p-${i}`)))
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
        if (token.startsWith('`')) nodes.push(h('code', { key }, token.slice(1, -1)))
        else if (token.startsWith('**')) nodes.push(h('strong', { key }, token.slice(2, -2)))
        else if (token.startsWith('*')) nodes.push(h('em', { key }, token.slice(1, -1)))
        else {
          const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token)
          nodes.push(link ? h('a', { key, href: link[2], target: '_blank', rel: 'noreferrer' }, link[1]) : token)
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
          setMessages([])
          setStreaming('')
          setLoading(false)
          return undefined
        }
        const abort = new AbortController()
        setMessages([])
        setStreaming('')
        setError('')
        setLoading(true)
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

    function firstUserText(view) {
      return view.messages.find(message => message.role === 'user')?.text ?? ''
    }

    function latestAssistantText(view) {
      if (view.streaming) return view.streaming
      const messages = view.messages.filter(message => message.role === 'assistant')
      return messages.length > 0 ? messages[messages.length - 1].text : ''
    }

    async function copyText(text) {
      if (!text) return
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }

    function createBtwStore() {
      let snapshot = Object.freeze({ bySession: Object.freeze({}) })
      const listeners = new Set()
      const state = {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
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
          const next = { ...snapshot.bySession }
          delete next[sessionId]
          update(next)
        },
      }
    }

    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      const existing = document.getElementById('sidemind-styles')
      if (existing) return () => {}
      const style = document.createElement('style')
      style.id = 'sidemind-styles'
      style.textContent = `
        .sidemind-side { height: 100%; min-height: 0; display: flex; flex-direction: column; color: var(--dsw-alias-label-primary, inherit); background: var(--dsw-alias-background-primary, transparent); font-size: 13px; }
        .sidemind-contextbar { min-height: 36px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 12px; border-bottom: 1px solid var(--dsw-alias-separator, rgba(127,127,127,.16)); color: var(--dsw-alias-label-secondary, #777); user-select: none; }
        .sidemind-context-main, .sidemind-context-meta, .sidemind-btw-identity, .sidemind-btw-actions, .sidemind-btw-footer { display: flex; align-items: center; }
        .sidemind-context-main { gap: 6px; min-width: 0; }
        .sidemind-context-title { color: var(--dsw-alias-label-primary, inherit); font-weight: 540; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sidemind-context-meta { gap: 5px; font-size: 11px; white-space: nowrap; color: var(--dsw-alias-label-tertiary, #999); }
        .sidemind-transcript { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 14px 22px; scroll-behavior: smooth; }
        .sidemind-turn { position: relative; margin: 0 0 18px; }
        .sidemind-turn-user { display: flex; justify-content: flex-end; }
        .sidemind-user-bubble { max-width: 88%; padding: 8px 11px; border-radius: 14px 14px 4px 14px; background: var(--dsw-alias-fill-secondary, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, inherit); overflow-wrap: anywhere; }
        .sidemind-assistant-body { min-width: 0; line-height: 1.58; overflow-wrap: anywhere; }
        .sidemind-message-actions { min-height: 24px; display: flex; justify-content: flex-start; align-items: center; margin-top: 2px; opacity: 0; transition: opacity 120ms ease; }
        .sidemind-turn-assistant:hover .sidemind-message-actions, .sidemind-message-actions:focus-within { opacity: 1; }
        .sidemind-icon-button { height: 26px; min-width: 26px; border: 0; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; color: var(--dsw-alias-label-secondary, #777); background: transparent; font: inherit; font-size: 12px; cursor: pointer; padding: 0 6px; }
        .sidemind-icon-button:hover:not(:disabled) { color: var(--dsw-alias-label-primary, inherit); background: var(--dsw-alias-fill-secondary, rgba(127,127,127,.10)); }
        .sidemind-icon-button:disabled { opacity: .35; cursor: default; }
        .sidemind-copied { font-size: 10px; }
        .sidemind-empty { height: 100%; min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; text-align: center; padding: 24px; color: var(--dsw-alias-label-tertiary, #999); }
        .sidemind-empty strong { color: var(--dsw-alias-label-secondary, #777); font-size: 13px; font-weight: 560; }
        .sidemind-empty span { max-width: 270px; line-height: 1.45; }
        .sidemind-empty-icon { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; margin-bottom: 2px; background: var(--dsw-alias-fill-secondary, rgba(127,127,127,.08)); color: var(--dsw-alias-label-secondary, #777); }
        .sidemind-empty-error { color: var(--dsw-alias-error, #c44); }
        .sidemind-inline-error { margin: 12px 0; padding: 9px 10px; border-radius: 8px; background: rgba(210,60,60,.08); color: var(--dsw-alias-error, #c44); font-size: 12px; }
        .sidemind-composer-shell { flex: 0 0 auto; padding: 8px 10px 10px; border-top: 1px solid var(--dsw-alias-separator, rgba(127,127,127,.14)); background: var(--dsw-alias-background-primary, transparent); }
        .sidemind-composer { border: 1px solid var(--dsw-alias-separator, rgba(127,127,127,.23)); border-radius: 13px; background: var(--dsw-alias-background-secondary, rgba(127,127,127,.045)); transition: border-color 120ms ease, background 120ms ease; }
        .sidemind-composer:focus-within { border-color: var(--dsw-alias-label-tertiary, rgba(127,127,127,.46)); background: var(--dsw-alias-background-primary, transparent); }
        .sidemind-composer-input { display: block; width: 100%; height: 38px; max-height: 160px; resize: none; overflow-y: auto; box-sizing: border-box; border: 0; outline: 0; padding: 10px 11px 4px; color: inherit; background: transparent; font: inherit; line-height: 1.45; }
        .sidemind-composer-input::placeholder { color: var(--dsw-alias-label-tertiary, #999); }
        .sidemind-composer-footer { min-height: 32px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 5px 5px 10px; }
        .sidemind-keyhint { color: var(--dsw-alias-label-tertiary, #999); font-size: 10px; }
        .sidemind-send { width: 27px; height: 27px; border: 0; border-radius: 8px; display: grid; place-items: center; background: var(--dsw-alias-label-primary, #222); color: var(--dsw-alias-background-primary, #fff); font: 600 15px/1 system-ui, sans-serif; cursor: pointer; }
        .sidemind-send:disabled { opacity: .24; cursor: default; }
        .sidemind-spinner { width: 10px; height: 10px; border-radius: 999px; border: 1.5px solid currentColor; border-right-color: transparent; animation: sidemind-spin .7s linear infinite; }
        .sidemind-thinking-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: .55; animation: sidemind-pulse 1.25s ease-in-out infinite; }

        .sidemind-btw { position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); width: min(680px, calc(100% - 24px)); max-height: min(520px, 58vh); display: flex; flex-direction: column; overflow: hidden; z-index: 40; color: var(--dsw-alias-label-primary, inherit); background: var(--dsw-alias-background-primary, #fff); background: color-mix(in srgb, var(--dsw-alias-background-primary, #fff) 96%, transparent); border: 1px solid var(--dsw-alias-separator, rgba(127,127,127,.20)); border-radius: 14px; box-shadow: 0 14px 44px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08); backdrop-filter: blur(14px); }
        .sidemind-btw-header { height: 40px; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 8px 0 12px; border-bottom: 1px solid var(--dsw-alias-separator, rgba(127,127,127,.13)); }
        .sidemind-btw-identity { min-width: 0; gap: 8px; }
        .sidemind-btw-title { font-weight: 650; letter-spacing: .02em; font-size: 12px; }
        .sidemind-btw-meta { color: var(--dsw-alias-label-tertiary, #999); font-size: 10px; }
        .sidemind-btw-actions { gap: 2px; }
        .sidemind-btw-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 14px 14px; }
        .sidemind-btw-question { margin: 0 0 12px; padding: 7px 9px; border-radius: 9px; background: var(--dsw-alias-fill-secondary, rgba(127,127,127,.09)); color: var(--dsw-alias-label-secondary, #777); font-size: 12px; }
        .sidemind-btw-answer { line-height: 1.56; }
        .sidemind-btw-pending { min-height: 56px; display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-tertiary, #999); }
        .sidemind-btw-footer { min-height: 28px; flex: 0 0 auto; justify-content: flex-end; gap: 5px; padding: 0 11px; border-top: 1px solid var(--dsw-alias-separator, rgba(127,127,127,.12)); color: var(--dsw-alias-label-tertiary, #999); font-size: 10px; user-select: none; }

        .sidemind-fallback-markdown { line-height: 1.55; overflow-wrap: anywhere; }
        .sidemind-fallback-markdown > :first-child { margin-top: 0; }
        .sidemind-fallback-markdown > :last-child { margin-bottom: 0; }
        .sidemind-fallback-markdown p { margin: 0 0 8px; white-space: pre-wrap; }
        .sidemind-fallback-markdown h1, .sidemind-fallback-markdown h2, .sidemind-fallback-markdown h3, .sidemind-fallback-markdown h4, .sidemind-fallback-markdown h5, .sidemind-fallback-markdown h6 { margin: 12px 0 7px; line-height: 1.28; }
        .sidemind-fallback-markdown h1 { font-size: 1.45em; } .sidemind-fallback-markdown h2 { font-size: 1.30em; } .sidemind-fallback-markdown h3 { font-size: 1.16em; }
        .sidemind-fallback-markdown ul, .sidemind-fallback-markdown ol { margin: 0 0 8px; padding-left: 22px; }
        .sidemind-fallback-markdown blockquote { margin: 0 0 8px; padding: 2px 0 2px 10px; border-left: 3px solid var(--dsw-alias-separator, rgba(127,127,127,.34)); color: var(--dsw-alias-label-secondary, #777); white-space: pre-wrap; }
        .sidemind-fallback-markdown pre { position: relative; margin: 0 0 8px; padding: 11px; overflow-x: auto; border-radius: 9px; background: var(--dsw-alias-background-secondary, rgba(127,127,127,.08)); font: 12px/1.52 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre; }
        .sidemind-fallback-markdown code { padding: 1px 4px; border-radius: 4px; background: var(--dsw-alias-fill-secondary, rgba(127,127,127,.12)); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .sidemind-fallback-markdown pre code { padding: 0; background: transparent; }
        .sidemind-fallback-markdown a { color: var(--dsw-alias-link, #4b7bec); text-decoration: underline; text-underline-offset: 2px; }
        .sidemind-code-language { margin-bottom: 6px; color: var(--dsw-alias-label-tertiary, #999); font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }

        @keyframes sidemind-spin { to { transform: rotate(360deg); } }
        @keyframes sidemind-pulse { 0%,100% { opacity: .25; transform: scale(.82); } 50% { opacity: .72; transform: scale(1); } }
        @media (max-width: 720px) { .sidemind-btw { width: calc(100% - 12px); bottom: calc(100% + 6px); border-radius: 12px; } .sidemind-keyhint { display: none; } }
        @media (prefers-reduced-motion: reduce) { .sidemind-spinner, .sidemind-thinking-dot { animation: none; } .sidemind-transcript { scroll-behavior: auto; } }
      `
      document.head.appendChild(style)
      return () => style.remove()
    }

    function icon(Component, fallback) {
      return Component ? h(Component, { 'aria-hidden': true }) : h('span', { 'aria-hidden': true }, fallback)
    }

    function errorMessage(error) {
      try { return error instanceof Error ? error.message : String(error) } catch { return '<unrenderable error>' }
    }

    function h(type, props, ...children) { return React.createElement(type, props, ...children) }
    function useBtwStore(store, selector) { return selector(useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)) }
    function useBtwFallback(props) { return props.useBtw ?? (selector => useBtwStore(btw.state, selector)) }

    const rawBtwOverlay = BtwOverlay
    BtwOverlay = function WrappedBtwOverlay(props) { return rawBtwOverlay({ ...props, useBtw: useBtwFallback(props) }) }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
