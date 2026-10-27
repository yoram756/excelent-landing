const test = require('node:test'), assert = require('node:assert/strict');

test('ESLint RTL rule rejects physical classes and accepts the logical equivalents', async () => {
  const { Linter } = await import('eslint'); const { logicalClasses } = await import('../tools/rtl-rules.mjs');
  const linter = new Linter();
  const config = [{ plugins: { rtl: { rules: { logical: logicalClasses } } }, rules: { 'rtl/logical': 'error' } }];
  for (const token of ['mr-4', 'ml-2', 'pl-4', 'pr-2', 'left-0', 'right-2', 'text-left', 'border-r-2', 'md:hover:mr-4', 'tracking-wide', 'px-4']) assert.ok(linter.verify(`const example = '${token}';`, config).some(m => m.ruleId === 'rtl/logical'), token);
  for (const token of ['ms-4', 'me-2', 'ps-4', 'pe-2', 'start-0', 'end-2', 'text-start', 'border-s-2']) assert.equal(linter.verify(`const example = '${token}';`, config).length, 0, token);
  assert.ok(linter.verify('const example = `md:mr-4`;', config).some(m => m.ruleId === 'rtl/logical'));
});
