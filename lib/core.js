import { randomUUID } from 'node:crypto'

export const SIDE_KIND = 'side'
export const BTW_KIND = 'btw'

export function createSnapshot({ sessionId, boundary = null, createdAt = Date.now() }) {
  if (!sessionId) throw new TypeError('sessionId is required')
  return Object.freeze({ sessionId: String(sessionId), boundary, createdAt })
}

export class SideMindRegistry {
  #items = new Map()

  createSide(snapshot, { title = 'Side', id = randomUUID() } = {}) {
    const item = {
      id,
      kind: SIDE_KIND,
      title,
      snapshot,
      createdAt: Date.now(),
      messages: [],
      state: 'idle',
      abortController: new AbortController(),
    }
    this.#items.set(id, item)
    return item
  }

  createBtw(snapshot, { id = randomUUID(), question = '' } = {}) {
    const item = {
      id,
      kind: BTW_KIND,
      snapshot,
      createdAt: Date.now(),
      question,
      answer: '',
      state: 'idle',
      abortController: new AbortController(),
    }
    this.#items.set(id, item)
    return item
  }

  get(id) { return this.#items.get(id) }
  list(kind) { return [...this.#items.values()].filter(item => kind === undefined || item.kind === kind) }

  appendMessage(id, message) {
    const item = this.#items.get(id)
    if (!item || item.kind !== SIDE_KIND) throw new Error(`unknown side: ${id}`)
    item.messages.push(Object.freeze({ ...message }))
    return item
  }

  close(id) {
    const item = this.#items.get(id)
    if (!item) return false
    item.abortController.abort(new Error('SideMind view closed'))
    item.state = 'closed'
    this.#items.delete(id)
    return true
  }

  closeAll() {
    for (const id of [...this.#items.keys()]) this.close(id)
  }
}

export function renderBtwPrompt(question) {
  const text = String(question).trim()
  if (!text) throw new TypeError('question is required')
  return [
    'This is a SideMind side question.',
    'Answer directly from the inherited conversation context.',
    'Do not use tools. Do not change the parent conversation. Do not promise actions.',
    '',
    `Question: ${text}`,
  ].join('\n')
}

export function renderSideBootstrap() {
  return [
    'This is a SideMind side conversation forked from the parent conversation.',
    'Treat inherited context as background. Continue only inside this side conversation.',
    'Do not modify or steer the parent conversation unless the user explicitly uses Send to Main.',
    'Default tool policy is read-only.',
  ].join('\n')
}
