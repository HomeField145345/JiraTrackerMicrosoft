import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

async function harness({ authError, workerError } = {}) {
  const logs = [];
  const elements = new Map();
  const ownerId = '11111111-1111-1111-1111-111111111111';
  const tenantId = '22222222-2222-2222-2222-222222222222';
  const config = {
    clientId: '33333333-3333-3333-3333-333333333333',
    tenantId,
    ownerObjectId: ownerId,
    target: { driveId: 'private-drive', folderId: 'private-folder' }
  };
  class PublicClientApplication {
    async initialize() {}
    async acquireTokenPopup() {
      if (authError) throw authError;
      return { accessToken: 'secret-token', account: { idTokenClaims: { oid: ownerId, tid: tenantId } } };
    }
  }
  class Worker {
    postMessage() {
      this.onmessage({ data: { error: workerError } });
    }
  }
  const context = vm.createContext({
    PublicClientApplication, Worker, URL,
    location: { href: 'https://example.test/excel.html' },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { setAttribute() {}, hidden: true });
        return elements.get(id);
      }
    },
    fetch: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => config }),
    console: {
      info: (...args) => logs.push(args),
      error: (...args) => logs.push(args)
    }
  });
  const source = readFileSync(new URL('../src/client/excel-tracker.mjs', import.meta.url), 'utf8')
    .replace("import { PublicClientApplication } from '@azure/msal-browser';", '');
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  await elements.get('connect').onclick();
  return { logs, status: elements.get('status').textContent };
}

test('reports consent error details without logging the raw Microsoft message', async () => {
  const error = new Error('AADSTS65001: private account details and secret-token');
  error.errorCode = 'consent_required';
  error.correlationId = '44444444-4444-4444-4444-444444444444';
  const { logs } = await harness({ authError: error });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /Files.ReadWrite.All/);
  assert.match(serialized, /authentication/);
  assert.match(serialized, /consent_required/);
  assert.match(serialized, /AADSTS65001/);
  assert.match(serialized, /44444444-4444-4444-4444-444444444444/);
  assert.doesNotMatch(serialized, /private account details|secret-token|private-drive|private-folder/);
});

test('distinguishes workbook HTTP failures from authentication failures', async () => {
  const { logs, status } = await harness({
    workerError: 'Could not open the workbook (Microsoft HTTP 403). private filename'
  });
  const failure = logs.find(([message]) => message === '[Excel tracker] Operation failed')[1];
  assert.equal(failure.stage, 'workbook operation');
  assert.equal(failure.httpStatus, '403');
  assert.match(status, /Microsoft HTTP 403/);
  assert.doesNotMatch(JSON.stringify(logs), /private filename|secret-token/);
});
