import { renderBtwPrompt } from './core.js'

export const name = 'sidemind'
export const inject = ['commands']
export const FORK_PROVIDER = 'fork'

export function apply(ctx) {
  ctx.commands.register({
    name: 'btw',
    description: 'Ask a temporary SideMind question without changing the main conversation',
    input: { hint: '<question>' },
    handler: invocation => executeBtw(ctx, invocation),
  })
}

export async function executeBtw(ctx, { agent, rawInput, signal }) {
  const question = String(rawInput ?? '').trim()
  if (!question) return { kind: 'error', text: 'Usage: /btw <question>' }

  const subagents = ctx.get?.('subagents')
  if (!subagents?.start || !subagents?.getProvider?.(FORK_PROVIDER)) {
    return { kind: 'error', text: 'SideMind requires the DSH fork subagent provider.' }
  }

  let run
  try {
    run = await subagents.start(FORK_PROVIDER, {
      label: 'sidemind-btw',
      prompt: [{ type: 'text', text: renderBtwPrompt(question) }],
      parent: agent,
      signal,
      toolFilter: { allow: [] },
    })
    const result = await run.result
    const answer = outputText(result.output)
    if (result.stopReason === 'completed' && answer) return { kind: 'success', text: answer }
    return { kind: 'error', text: answer || `Side question ended (${result.stopReason}).` }
  } catch (error) {
    return { kind: 'error', text: `Side question failed: ${errorMessage(error)}` }
  } finally {
    try { await run?.dispose?.() } catch (error) {
      ctx.logger?.warn?.(`sidemind: failed to dispose BTW child: ${errorMessage(error)}`)
    }
  }
}

function outputText(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter(block => block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
    .trim()
}

function errorMessage(error) {
  try { return error instanceof Error ? error.message : String(error) } catch { return '<unrenderable error>' }
}
