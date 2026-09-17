import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

test('client bundle registers under the package name', () => {
  const match = /__ModuleLoader__\.load\(\{\s*id:\s*['\"]([^'\"]+)['\"]/u.exec(client)
  assert.ok(match, 'client bundle must register itself through __ModuleLoader__.load')
  assert.equal(match[1], pkg.name)
})
