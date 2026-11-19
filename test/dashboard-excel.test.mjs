import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createExcelBridge, READ_ONLY_MESSAGE } from '../src/client/dashboard-excel.mjs';

const ids = {
  clientId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  ownerObjectId: '33333333-3333-3333-3333-333333333333'
};
const dashboardData = { projects: [{ 'Jira #': 'ABC-1' }], independentTasks: [], config: { stages: [] } };

function fakeDocument() {
  const elements = {};
  for (const id of ['signin-panel', 'signin-status', 'signin-btn', 'signin-workbook-link']) {
    const classes = new Set(id === 'signin-panel' ? ['hidden'] : []);
    elements[id] = {
      hidden: id === 'signin-btn' || id === 'signin-workbook-link',
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

function setup({ oid = ids.ownerObjectId, connectResult, connectError, errorWorkbookUrl, userRole = 'admin' } = {}) {
  const doc = fakeDocument();
  const actions = [];
  const messages = [];
  class FakeWorker {
    postMessage(message) {
      actions.push(message.action);
      messages.push(message);
      const result = message.action === 'connect' && connectResult ? connectResult : {
          itemId: 'item-1', webUrl: 'https://example.com/book', projects: dashboardData,
          response: { status: 'success', message: 'Workbook saved.' },
          user: {
            id: 'user-1', username: 'owner@example.com', email: 'owner@example.com',
            displayName: 'Owner', role: userRole, isActive: true, microsoftObjectId: oid
          }
        };
      const data = message.action === 'connect' && connectError ?
        { error: connectError, workbookUrl: errorWorkbookUrl } : { result };
      queueMicrotask(() => this.onmessage({ data }));
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
  return { bridge, doc, actions, messages };
}

test('loads the workbook-matched profile after Microsoft sign-in', async () => {
  const { bridge, doc, actions } = setup();
  await bridge.initialize();
  const panel = doc.elements['signin-panel'];
  assert.equal(panel.classList.contains('hidden'), false);
  assert.equal(doc.elements['signin-btn'].hidden, false);

  await bridge.signIn();
  await bridge.whenSignedIn();
  assert.equal(panel.classList.contains('hidden'), true);
  assert.equal(bridge.isSignedIn(), true);
  assert.equal(bridge.user().role, 'admin');
  assert.equal(bridge.user().microsoftObjectId, ids.ownerObjectId);

  assert.deepEqual(await bridge.call('getProjectData', []), dashboardData);
  assert.deepEqual(actions, ['connect']);
  await bridge.call('getProjectData', []);
  assert.deepEqual(actions, ['connect', 'refresh']);
  assert.deepEqual(await bridge.call('getConfigData', []), { config: dashboardData.config });
});

test('routes allowlisted dashboard edits to the workbook worker', async () => {
  const { bridge, actions, messages } = setup();
  await bridge.initialize();
  await bridge.signIn();
  const response = await bridge.call('saveManualData', ['ABC-1', 'Priority', 'High']);
  assert.deepEqual(response, { status: 'success', message: 'Workbook saved.' });
  assert.deepEqual(actions, ['connect', 'mutate']);
  assert.deepEqual(messages[1].payload, { method: 'saveManualData', args: ['ABC-1', 'Priority', 'High'] });
  assert.equal(messages[1].userObjectId, ids.ownerObjectId);
  assert.equal(messages[1].ownerObjectId, ids.ownerObjectId);
  await bridge.call('saveDeveloperCapacity', [[{ developer: 'Avery', capacity: 5 }]]);
  assert.deepEqual(messages[2].payload, {
    method: 'saveDeveloperCapacity', args: [[{ developer: 'Avery', capacity: 5 }]]
  });
  await bridge.call('getUsers', []);
  assert.deepEqual(messages[3].payload, { method: 'listUsers', args: [] });
  await bridge.call('saveUsers', [[{ username: 'member', role: 'user' }]]);
  assert.deepEqual(messages[4].payload, {
    method: 'saveUsers', args: [[{ username: 'member', role: 'user' }]]
  });
  await assert.rejects(bridge.call('saveUser', ['user-1', {}]), { message: READ_ONLY_MESSAGE });
});

test('applies the workbook role to a Microsoft account other than the configured owner', async () => {
  const memberObjectId = '44444444-4444-4444-4444-444444444444';
  const { bridge } = setup({ oid: memberObjectId, userRole: 'project_manager' });
  await bridge.initialize();
  await bridge.signIn();
  assert.equal(bridge.isSignedIn(), true);
  assert.equal(bridge.user().role, 'project_manager');
  assert.equal(bridge.user().microsoftObjectId, memberObjectId);
});

test('keeps sign-in open when the workbook has no active matching user', async () => {
  const { bridge, doc } = setup({
    connectError: 'Your Microsoft account is not assigned an active user in this workbook.',
    errorWorkbookUrl: 'https://example.com/book'
  });
  await bridge.initialize();
  await bridge.signIn();
  assert.equal(bridge.isSignedIn(), false);
  assert.equal(doc.elements['signin-panel'].classList.contains('hidden'), false);
  assert.match(doc.elements['signin-status'].textContent, /not assigned an active user/);
  assert.equal(doc.elements['signin-workbook-link'].hidden, false);
  assert.equal(doc.elements['signin-workbook-link'].href, 'https://example.com/book');
});

test('does not expose an unsafe workbook link on sign-in failure', async () => {
  const { bridge, doc } = setup({ connectError: 'No matching user.', errorWorkbookUrl: 'javascript:alert(1)' });
  await bridge.initialize();
  await bridge.signIn();
  assert.equal(doc.elements['signin-workbook-link'].hidden, true);
});

test('tells the user when the workbook still needs setup', async () => {
  const { bridge, doc } = setup({ connectResult: { needsSetup: true } });
  await bridge.initialize();
  await bridge.signIn();
  assert.equal(bridge.isSignedIn(), false);
  assert.match(doc.elements['signin-status'].textContent, /not set up yet/);
});

test('developer configuration renders Jira assignees and saves valid capacity', async () => {
  class Element {
    constructor() {
      this.children = [];
      this.dataset = {};
      this.validity = { valid: true };
      this.value = '';
    }
    replaceChildren() { this.children = []; }
    insertRow() { const row = new Element(); this.children.push(row); return row; }
    insertCell() { const cell = new Element(); this.children.push(cell); return cell; }
    appendChild(child) { this.children.push(child); }
    focus() { this.focused = true; }
  }
  const elements = {
    'developer-capacity-body': new Element(),
    'developer-capacity-status': new Element(),
    'save-developer-capacity': new Element()
  };
  const inputs = () => elements['developer-capacity-body'].children.flatMap(row =>
    row.children.flatMap(cell => cell.children.filter(child => child.type === 'number'))
  );
  const data = {
    projects: [{ Assignee: ' Avery ' }, { Assignee: 'avery' }, { Assignee: 'Blair' }, { Assignee: '' }],
    developerCapacity: [{ developer: 'avery', capacity: 0 }]
  };
  const calls = [];
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: {
      getElementById: id => elements[id],
      createElement: () => new Element(),
      querySelectorAll: () => inputs()
    },
    APP_STATE: { allData: data },
    checkAuth: () => 'token',
    getErrorMessage_: error => error.message,
    handleDataLoaded: () => true,
    callServer: async (method, args) => {
      calls.push({ method, args });
      return method === 'saveDeveloperCapacity' ? { status: 'success' } : data;
    }
  });
  vm.runInContext(readFileSync(new URL('../src/client/ui.js', import.meta.url), 'utf8'), context);
  context.renderDeveloperCapacityConfig();
  assert.deepEqual(inputs().map(input => [input.dataset.developer, input.value]), [['Avery', '0'], ['Blair', '']]);
  inputs()[1].validity.valid = false;
  context.saveDeveloperCapacity({ preventDefault() {} });
  assert.equal(calls.length, 0);
  assert.match(elements['developer-capacity-status'].textContent, /non-negative/);
  inputs()[1].validity.valid = true;
  inputs()[1].value = '5.5';
  context.saveDeveloperCapacity({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { method: 'saveDeveloperCapacity', args: [[{ developer: 'Avery', capacity: '0' }, { developer: 'Blair', capacity: '5.5' }]] },
    { method: 'getProjectData', args: [] }
  ]);
  assert.equal(elements['developer-capacity-status'].textContent, 'Capacity saved.');
  assert.equal(elements['save-developer-capacity'].disabled, false);
});
