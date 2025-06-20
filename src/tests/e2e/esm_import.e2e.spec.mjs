import test from 'ava'
import { Permit } from 'permitio'

test('import Permit properly on ESModule', (t) => {
  t.truthy(Permit)
  t.is(typeof Permit, 'function')
  t.is(Permit.name, 'Permit')
})
