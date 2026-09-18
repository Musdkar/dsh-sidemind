import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const clientEntry = String(pkg.exports['./client'])
const clientPath = clientEntry.startsWith('./') ? clientEntry.slice(2) : clientEntry
const client = await readFile(new URL(`../${clientPath}`, import.meta.url), 'utf8')

test('client bundle registers under the package name', () => {
  const marker = "id: '"
  const loaderStart = client.indexOf('__ModuleLoader__.load({')
  assert.notEqual(loaderStart, -1, 'client bundle must register itself through __ModuleLoader__.load')
  const idStart = client.indexOf(marker, loaderStart)
  assert.notEqual(idStart, -1, 'client bundle must declare a loader id')
  const valueStart = idStart + marker.length
  const valueEnd = client.indexOf("'", valueStart)
  assert.equal(client.slice(valueStart, valueEnd), pkg.name)
})

test('sidebar cleanup uses the tab occurrence signal instead of newer close-handler API', () => {
  assert.equal(client.includes('sidebarRight.registerCloseHandler'), false)
  assert.equal(client.includes('tab?.signal'), true)
  assert.equal(client.includes("addEventListener('abort'"), true)
})

test('client uses prefixed internal side controls', () => {
  assert.equal(client.includes('__sidemind_internal_control_v1__:'), true)
  assert.equal(client.includes('CONTROL_PREFIX'), true)
  assert.equal(client.includes('JSON.stringify(payload)'), true)
})

test('side and btw render Markdown through the DSH primitive when available', () => {
  assert.equal(client.includes('@deepseek-ai/dsh-client-ui-primitives'), true)
  assert.equal(client.includes('NativeMarkdownText'), true)
  assert.equal(client.includes('function MarkdownBody'), true)
  assert.equal(client.includes('renderMarkdownBlocks'), true)
})

test('0.2 client exposes the compact side and BTW surfaces', () => {
  assert.equal(pkg.version, '0.2.0')
  assert.equal(clientEntry, './lib/client.js')
  assert.equal(client.includes('sidemind-contextbar'), true)
  assert.equal(client.includes('sidemind-composer'), true)
  assert.equal(client.includes('sidemind-btw-header'), true)
  assert.equal(client.includes('C copy Markdown'), true)
  assert.equal(client.includes('Enter send'), true)
})
