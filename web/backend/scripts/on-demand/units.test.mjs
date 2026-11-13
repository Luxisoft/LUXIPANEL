import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appUnits, unitQuote } from './units.mjs';

const fixture = { name: 'test-api', cwd: '/srv/app', script: '/srv/app/server.mjs', envFile: '/run/private/env.json', preload: '/srv/runtime.mjs', port: 19001, host: '127.0.0.1' };
test('socket remains enabled while the application itself has no boot target', () => {
  const result = appUnits(fixture);
  assert.match(result.socket, /WantedBy=sockets.target/);
  assert.match(result.socket, /ListenStream=127.0.0.1:19001/);
  assert.doesNotMatch(result.service, /WantedBy=/);
  assert.match(result.service, /Type=exec/);
  assert.match(result.service, /DEMAND_IDLE_MS=60000/);
  assert.match(result.service, /KillMode=control-group/);
  assert.doesNotMatch(result.service, /PRIVATE_VALUE|API_KEY/);
});
test('invalid paths, units and control characters never produce units', () => {
  assert.throws(() => appUnits({ ...fixture, name: '../other' }));
  assert.throws(() => appUnits({ ...fixture, cwd: 'relative' }));
  assert.throws(() => appUnits({ ...fixture, script: '/srv/app\nExecStart=/bin/other' }));
  assert.equal(unitQuote('/path/with%name $x'), '"/path/with%%name $$x"');
});
