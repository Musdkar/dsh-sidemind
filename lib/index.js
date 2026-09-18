import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionLogOffset } from '@deepseek-ai/dsh-session'
import {
  appendDelegatedPolicyOverrides,
  applyChildComposition,
  captureDelegatedPolicyOverrides,
  childSessionMeta,
  resolveChildAgentOptions,
  resolveChildDepth,
  snapshotSubagentDescriptor,
} from '@deepseek-ai/dsh-subagent'
import { parseSideCommandInput, renderForkBoundary } from './core.js'

export const name = 'sidemind'
export const inject = ['commands']

const START_PREFIX = 'sidemind'
const SIDE_COMMAND = 'side'
const BTW_COMMAND = 'btw'
const READ_ONLY_TOOLS = new Set([
  'read', 'read_image', 'glob', 'grep', 'web_search', 'web_fetch',
  'session_event_read', 'session_event_search', 'session_event_trace',
  'session_search', 'session_trace', 'list_mcp_resources',
  'list_mcp_resource_templates', 'read_mcp_resource', 'lsp',
])

export function apply(ctx) {
  const sessions = new Map()

  ctx.commands.register({
    name: SIDE_COMMAND,
    description: 'Open a temporary SideMind conversation beside the main chat',
    input: { hint: '[question]' },
    recordInput: false,
    handler: invocation => executeSide(ctx, sessions, invocation),
  })

  ctx.commands.register({
    name: BTW_COMMAND,
    description: 'Ask a temporary SideMind question without changing the main conversation',
    input: { hint: '<question>' },
    recordInput: false,
    handler: invocation => executeBtw(ctx, sessions, invocation),
  })

  ctx.effect(() => async () => {
    const pending = [...sessions.values()].map(entry => disposeEntry(ctx, sessions, entry))
    await Promise.allSettled(pending)
  }, 'sidemind: ephemeral sessions')
}

async function executeSide(ctx, sessions, { agent, rawInput, signal }) {
  const parsed = parseSideCommandInput(rawInput)

  if (parsed.kind === 'start') {
    try {
      const entry = await createEphemeralChild(agent, signal, 'side')
      sessions.set(entry.id, entry)
      if (parsed.question) sendPrompt(entry, parsed.question)
      return { kind: 'success', text: startToken(entry) }
    } catch (error) {
      return { kind: 'error', text: `SideMind could not start: ${errorMessage(error)}` }
    }
  }

  if (parsed.kind === 'invalid-control') {
    return { kind: 'error', text: 'SideMind internal request was malformed.' }
  }

  const request = parsed.request
  if (!request || typeof request !== 'object' || typeof request.op !== 'string' || typeof request.id !== 'string') {
    return { kind: 'error', text: 'SideMind internal request was malformed.' }
  }
  const entry = sessions.get(request.id)
  if (!entry || entry.parentId !== String(agent.id)) return { kind: 'error', text: 'SideMind session is no longer available.' }

  if (request.op === 'prompt') {
    if (entry.kind !== 'side' || typeof request.text !== 'string' || request.text.trim() === '') {
      return { kind: 'error', text: 'SideMind prompt is empty or invalid.' }
    }
    sendPrompt(entry, request.text)
    return { kind: 'success' }
  }

  if (request.op === 'close') {
    await disposeEntry(ctx, sessions, entry)
    return { kind: 'success' }
  }

  return { kind: 'error', text: 'Unknown SideMind operation.' }
}

async function executeBtw(ctx, sessions, { agent, rawInput, signal }) {
  const question = String(rawInput ?? '').trim()
  if (!question) return { kind: 'error', text: 'Usage: /btw <question>' }
  try {
    const entry = await createEphemeralChild(agent, signal, 'btw')
    sessions.set(entry.id, entry)
    sendPrompt(entry, question)
    return { kind: 'success', text: startToken(entry) }
  } catch (error) {
    return { kind: 'error', text: `Side question could not start: ${errorMessage(error)}` }
  }
}

function sendPrompt(entry, text) {
  entry.handle.agent.followup(createUserMessage({
    content: [{ type: 'text', text: String(text).trim() }],
    source: { kind: 'user' },
  }))
}

async function createEphemeralChild(parent, signal, kind) {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('request aborted')
  const seed = completedTurnPrefix(parent)
  const boundary = seed.length
  const childDepth = resolveChildDepth(parent, undefined)
  const childId = brandString(randomUUID())
  const inherited = captureDelegatedPolicyOverrides(parent)
  const descriptor = snapshotSubagentDescriptor({
    mode: 'one-shot',
    provider: 'sidemind',
    label: kind === 'side' ? 'SideMind' : 'BTW',
  })

  const handle = await parent.ctx.agents.create({
    sessionId: childId,
    parentAgent: parent,
    meta: childSessionMeta(parent, childDepth, seed.length > 0),
    ...(seed.length > 0 ? { seed, inheritedEventCount: SessionLogOffset(seed.length) } : {}),
    agentOptions: resolveChildAgentOptions(parent, undefined, childDepth),
    signal,
    setup(childCtx, child) {
      appendDelegatedPolicyOverrides(child.session, inherited)
      applyChildComposition(childCtx, parent, {})
      installForkBoundary(childCtx, kind)
      const visible = childCtx.tools.schemas(child).map(schema => schema.name)
      if (kind === 'btw') {
        childCtx.tools.restrict({ allow: [] })
      } else {
        childCtx.tools.restrict({ allow: visible.filter(tool => READ_ONLY_TOOLS.has(tool)) })
      }
      child.session.append('subagent/descriptor', descriptor)
    },
  })

  return {
    id: String(childId),
    parentId: String(parent.id),
    kind,
    boundary,
    handle,
  }
}


function installForkBoundary(childCtx, kind) {
  const systemPrompt = childCtx.systemPrompt
  if (!systemPrompt || typeof systemPrompt.section !== 'function') return
  const register = () => systemPrompt.section({
    name: 'sidemind:fork-boundary',
    order: 10350,
    text: renderForkBoundary(kind),
    interpolate: false,
  })
  if (typeof childCtx.effect === 'function') {
    childCtx.effect(register, 'sidemind: fork boundary')
  } else {
    register()
  }
}

function completedTurnPrefix(parent) {
  const events = parent.session.snapshotEvents()
  const lastEnd = events.findLast(event => event.type === 'turn/end')
  return lastEnd === undefined ? [] : events.slice(0, lastEnd.seq + 1)
}

function startToken(entry) {
  return `${START_PREFIX}:${entry.kind}:${entry.id}:${entry.boundary}`
}

async function disposeEntry(ctx, sessions, entry) {
  if (!sessions.has(entry.id)) return
  sessions.delete(entry.id)
  try {
    await entry.handle.dispose()
  } catch (error) {
    ctx.logger?.warn?.(`sidemind: failed to dispose ${entry.id}: ${errorMessage(error)}`)
  }
}

function errorMessage(error) {
  try { return error instanceof Error ? error.message : String(error) } catch { return '<unrenderable error>' }
}
