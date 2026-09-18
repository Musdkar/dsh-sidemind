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
  assert.doesNotMatch(client, /sidebarRight\\.registerCloseHandler/u)
  assert.match(client, /tab\\?\\.signal/u)
  assert.match(client, /addEventListener\\('abort'/u)
})

test('client uses prefixed internal side controls', () => {
  assert.match(client, /__sidemind_internal_control_v1__:/u)
  assert.match(client, /CONTROL_PREFIX.*JSON\\.stringify/su)
})

test('side and btw render Markdown through the DSH primitive when available', () => {
  assert.match(client, /dsh-client-ui-primitives/u)
  assert.match(client, /NativeMarkdownText/u)
  assert.match(client, /function MarkdownBody/u)
  assert.match(client, /renderMarkdownBlocks/u)
})

test('0.2 client exposes the compact side and BTW surfaces', () => {
  assert.equal(pkg.version, '0.2.0')
  assert.equal(clientEntry, './lib/client.js')
  assert.match(client, /sidemind-contextbar/u)
  assert.match(client, /sidemind-composer/u)
  assert.match(client, /sidemind-btw-header/u)
  assert.match(client, /C copy Markdown/u)
  assert.match(client, /Enter send/u)
})
