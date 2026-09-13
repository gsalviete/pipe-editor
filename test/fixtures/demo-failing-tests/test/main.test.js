const { test } = require('node:test');
const assert = require('node:assert/strict');

test('intentional failure: discount should be 20%', () => {
  const actualDiscount = 10;
  assert.equal(actualDiscount, 20, 'Demo failure: change actualDiscount to 20 to make this pass');
});
