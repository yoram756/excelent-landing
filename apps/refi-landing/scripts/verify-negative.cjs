const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const app = path.resolve(__dirname, '..');
const out = path.resolve(app, '../../tests/out/refi-cro-20261027');
fs.mkdirSync(out, { recursive: true });
const source = fs.readFileSync(path.join(app, 'src/lib/lead.ts'), 'utf8');
const guard = "if (!response.ok) throw Error('not-confirmed');";
assert.equal(source.split(guard).length, 2, 'Mutation must remove exactly one HTTP guard');
const mutant = path.join(out, 'lead-mutant.ts');
fs.writeFileSync(mutant, source.replace(guard, '// Deliberately broken only in this ignored negative-control copy.'));
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/lead.test.cjs'], {
  cwd: app, env: { ...process.env, CRO_LEAD_TEST_SOURCE: mutant }, encoding: 'utf8', timeout: 30000,
});
const output = (result.stdout || '') + (result.stderr || '');
fs.writeFileSync(path.join(out, 'negative-control.log'), output);
assert.equal(result.status, 1, 'The suite must reject a source copy without its HTTP success guard');
assert.match(output, /Missing expected rejection/);
const report = { status: 'PASS', scope: 'Negative control, not production', mutation: 'HTTP success guard removed in an ignored source copy', expectedTestExit: 1, actualTestExit: result.status, testDetected: 'Missing expected rejection', sourceChanged: false };
fs.writeFileSync(path.join(out, 'negative-control.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
