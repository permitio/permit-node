const test = require('ava')
const Permit = require('permitio')

test('require Permit properly on CommonJS', (t) => {
  t.truthy(Permit)
  t.is(typeof Permit, 'object')
  t.is(typeof Permit.Permit, 'function')
  t.is(Permit.Permit.name, 'Permit')
})
