import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SIDE_CONTROL_PREFIX,
  SideMindRegistry,
  createSnapshot,
  parseSideCommandInput,
  renderBtwPrompt,
  renderForkBoundary,
} from '../lib/core.js'

test('side lifecycle is ephemeral', () => {
  const registry = new SideMindRegistry()
  const snapshot = createSnapshot({ sessionId: 'main-1', boundary: 42 })
  const side = registry.createSide(snapshot, { id: 'side-1' })
  registry.appendMessage(side.id, { role: 'user', text: 'hello' })
  assert.equal(registry.get(side.id).messages.length, 1)
  assert.equal(registry.close(side.id), true)
  assert.equal(registry.get(side.id), undefined)
  assert.equal(side.abortController.signal.aborted, true)
})

test('btw and side can share the exact same snapshot object', () => {
  const registry = new SideMindRegistry()
  const snapshot = createSnapshot({ sessionId: 'main-1', boundary: 7 })
  const btw = registry.createBtw(snapshot, { id: 'btw-1', question: 'why?' })
  const side = registry.createSide(snapshot, { id: 'side-1' })
  assert.equal(btw.snapshot, side.snapshot)
})

test('BTW prompt explicitly forbids tools and parent mutation', () => {
  const prompt = renderBtwPrompt('Why use a fork?')
  assert.match(prompt, /Do not use tools/)
  assert.match(prompt, /Do not change the parent conversation/)
  assert.match(prompt, /Why use a fork\?/)
})

test('/side accepts an initial question as normal user text', () => {
  assert.deepEqual(parseSideCommandInput('why use a fork?'), {
    kind: 'start',
    question: 'why use a fork?',
  })
  assert.deepEqual(parseSideCommandInput(''), {
    kind: 'start',
    question: '',
  })
})

test('internal side control remains separate from user questions', () => {
  const request = { op: 'prompt', id: 'child-1', text: 'next' }
  assert.deepEqual(parseSideCommandInput(`${SIDE_CONTROL_PREFIX}${JSON.stringify(request)}`), {
    kind: 'control',
    request,
  })
})

test('fork boundary treats inherited history as reference context', () => {
  const side = renderForkBoundary('side')
  const btw = renderForkBoundary('btw')
  assert.match(side, /reference context only/)
  assert.match(side, /Do not continue unfinished plans/)
  assert.match(side, /read-only tools/)
  assert.match(btw, /Answer the side question directly/)
  assert.match(btw, /Do not use tools/)
})
