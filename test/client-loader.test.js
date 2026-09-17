import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const clientEntry = String(pkg.exports['./client'])
const client = await readFile(new URL(`../${clientEntry.replace(/^\.\//, '')}`, import.meta.url), 'utf8')

test('active client bundle registers under the package name', () => {
  const match = /__ModuleLoader__\.load\(\{\s*id:\s*['"]([^'"]+)['"]/u.exec(client)
  assert.ok(match, 'client bundle must register itself through __ModuleLoader__.load')
  assert.equal(match[1], pkg.name)
})

test('sidebar cleanup uses the tab occurrence signal instead of newer close-handler API', () => {
  assert.doesNotMatch(client, /sidebarRight\.registerCloseHandler/u)
  assert.match(client, /tab\?\.signal/u)
  assert.match(client, /addEventListener\('abort'/u)
})

test('client uses prefixed internal side controls', () => {
  assert.match(client, /__sidemind_internal_control_v1__:/u)
  assert.match(client, /CONTROL_PREFIX.*JSON\.stringify/su)
})

test('side and btw messages render markdown instead of raw text only', () => {
  assert.match(client, /function MarkdownBody/u)
  assert.match(client, /renderMarkdownBlocks/u)
  assert.match(client, /NativeMarkdownText/u)
})
