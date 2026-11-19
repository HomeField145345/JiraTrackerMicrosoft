import test from 'node:test';
import assert from 'node:assert/strict';
import { createExcelBridge, READ_ONLY_MESSAGE } from '../src/client/dashboard-excel.mjs';

const ids = {
  clientId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  ownerObjectId: '33333333-3333-3333-3333-333333333333'
};
const dashboardData = { projects: [{ 'Jira #': 'ABC-1' }], independentTasks: [], config: { stages: [] } };

function fakeDocument() {
  const elements = {};
  for (const id of ['signin-panel', 'signin-status', 'signin-btn']) {
    const classes = new Set(id === 'signin-panel' ? ['hidden'] : []);
    elements[id] = {
      hidden: id === 'signin-btn',
      textContent: '',
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      classList: {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        contains: name => classes.has(name)
      }
    };
  }
  return { getElementById: id => elements[id] || null, elements };
}

function setup({ oid = ids.ownerObjectId, connectResult } = {}) {
  const doc = fakeDocument();
  const actions = [];
  class FakeWorker {
    postMessage(message) {
      actions.push(message.action);
      const result = message.action === 'connect' && connectResult ?
        connectResult : { itemId: 'item-1', webUrl: 'https://example.com/book', projects: dashboardData };
      queueMicrotask(() => this.onmessage({ data: { result } }));
    }
    terminate() {}
  }
  const auth = { accessToken: 'token', account: { username: 'owner@example.com', name: 'Owner', idTokenClaims: { oid, tid: ids.tenantId } } };
  class FakeMsal {
    async initialize() {}
    async acquireTokenPopup() { return auth; }
    async acquireTokenSilent() { return auth; }
  }
  const bridge = createExcelBridge({
    document: doc,
    location: { href: 'https://example.com/app/index.html', reload() {} },
    fetch: async () => ({ ok: true, json: async () => ({ ...ids, target: { fileName: 'Tracker.xlsx' } }) }),
    Worker: FakeWorker,
    PublicClientApplication: FakeMsal
  });
  return { bridge, doc, actions };
}

test('shows the sign-in panel, then loads workbook data after the owner signs in', async () => {
  const { bridge, doc, actions } = setup();
  await bridge.initialize();
  const panel = doc.elements['signin-panel'];
  assert.equal(panel.classList.contains('hidden'), false);
  assert.equal(doc.elements['signin-btn'].hidden, false);

  await bridge.signIn();
  await bridge.whenSignedIn();
  assert.equal(panel.classList.contains('hidden'), true);
  assert.equal(bridge.isSignedIn(), true);

  assert.deepEqual(await bridge.call('getProjectData', []), dashboardData);
  assert.deepEqual(actions, ['connect']);
  await bridge.call('getProjectData', []);
  assert.deepEqual(actions, ['connect', 'refresh']);
  assert.deepEqual(await bridge.call('getConfigData', []), dashboardData.config);
});

test('rejects dashboard edits while the dashboard is read-only', async () => {
  const { bridge } = setup();
  await bridge.initialize();
  await bridge.signIn();
  await assert.rejects(bridge.call('saveManualData', ['ABC-1', 'Priority', 'High']), { message: READ_ONLY_MESSAGE });
});

test('keeps the sign-in panel open with a message for a non-owner account', async () => {
  const { bridge, doc } = setup({ oid: '44444444-4444-4444-4444-444444444444' });
  await bridge.initialize();
  await bridge.signIn();
  assert.equal(bridge.isSignedIn(), false);
  assert.equal(doc.elements['signin-panel'].classList.contains('hidden'), false);
  assert.match(doc.elements['signin-status'].textContent, /tracker owner/);
});

test('tells the user when the workbook still needs setup', async () => {
  const { bridge, doc } = setup({ connectResult: { needsSetup: true } });
  await bridge.initialize();
  await bridge.signIn();
  assert.equal(bridge.isSignedIn(), false);
  assert.match(doc.elements['signin-status'].textContent, /not set up yet/);
});
