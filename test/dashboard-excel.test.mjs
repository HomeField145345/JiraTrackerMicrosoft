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

function fakeClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    contains: name => classes.has(name),
    toggle(name, force) {
      if (force === undefined ? !classes.has(name) : force) classes.add(name);
      else classes.delete(name);
    }
  };
}

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

function setup({
  oid = ids.ownerObjectId, connectResult, connectError, errorWorkbookUrl, userRole = 'admin', cachedAccounts = []
} = {}) {
  const doc = fakeDocument();
  const actions = [];
  const messages = [];
  let msalConfig;
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
    terminate() { }
  }
  const auth = { accessToken: 'token', account: { username: 'owner@example.com', name: 'Owner', idTokenClaims: { oid, tid: ids.tenantId } } };
  class FakeMsal {
    constructor(config) { msalConfig = config; }
    async initialize() { }
    async acquireTokenPopup() { return auth; }
    async acquireTokenSilent() { return auth; }
    getAllAccounts() { return cachedAccounts; }
    getActiveAccount() { return cachedAccounts[0] || null; }
    setActiveAccount() { }
    getTokenCache() { return { removeAccount: async () => { } }; }
  }
  const bridge = createExcelBridge({
    document: doc,
    location: { href: 'https://example.com/app/index.html', reload() { } },
    fetch: async () => ({ ok: true, json: async () => ({ ...ids, target: { fileName: 'Tracker.xlsx' } }) }),
    Worker: FakeWorker,
    PublicClientApplication: FakeMsal
  });
  return { bridge, doc, actions, messages, get msalConfig() { return msalConfig; } };
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

test('silently reconnects to the workbook using a cached Microsoft account', async () => {
  const cachedAccount = {
    username: 'owner@example.com',
    tenantId: ids.tenantId,
    idTokenClaims: { oid: ids.ownerObjectId, tid: ids.tenantId }
  };
  const result = setup({ cachedAccounts: [cachedAccount] });
  const { bridge, doc, actions } = result;
  await bridge.initialize();
  await bridge.whenSignedIn();

  assert.equal(result.msalConfig.cache.cacheLocation, 'sessionStorage');
  assert.equal(bridge.isSignedIn(), true);
  assert.equal(doc.elements['signin-panel'].classList.contains('hidden'), true);
  assert.deepEqual(actions, ['connect']);
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

test('groups workflow Jira statuses by issue type', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(new URL('../src/client/Config.js', import.meta.url), 'utf8'), context);
  const statuses = context.getStatusesByIssueType_([
    { 'Issue Type': 'Epic', Status: 'In Progress' },
    { 'Issue Type': 'Story', Status: 'To Do' },
    { 'Issue Type': 'Bug', Status: 'In Progress' },
    { 'Issue Type': 'Story', Status: 'In Progress' },
    { 'Issue Type': 'Task', Status: 'Open' },
    { 'Issue Type': 'Bug', Status: ' ' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(statuses)), {
    epic: ['In Progress'],
    story: ['In Progress', 'To Do'],
    bug: ['In Progress']
  });
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
      this.classList = fakeClassList();
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
    window: { addEventListener() { } },
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
  context.saveDeveloperCapacity({ preventDefault() { } });
  assert.equal(calls.length, 0);
  assert.match(elements['developer-capacity-status'].textContent, /non-negative/);
  inputs()[1].validity.valid = true;
  inputs()[1].value = '5.5';
  context.saveDeveloperCapacity({ preventDefault() { } });
  elements['developer-capacity-status'].classList.add('hidden');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { method: 'saveDeveloperCapacity', args: [[{ developer: 'Avery', capacity: '0' }, { developer: 'Blair', capacity: '5.5' }]] },
    { method: 'getProjectData', args: [] }
  ]);
  assert.equal(elements['developer-capacity-status'].textContent, 'Capacity saved.');
  assert.equal(elements['developer-capacity-status'].classList.contains('hidden'), true);
  assert.equal(elements['save-developer-capacity'].disabled, false);
});

test('capacity view shows developer workload and expands sprint assignments independently', () => {
  class Element {
    constructor(tag = '') {
      this.tag = tag; this.children = []; this.textContent = ''; this.attributes = {}; this.listeners = {}; this.style = {};
    }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren() { this.children = []; }
    insertRow() { return this.appendChild(new Element('tr')); }
    insertCell() { return this.appendChild(new Element('td')); }
    createTHead() { return this.appendChild(new Element('thead')); }
    createTBody() { return this.appendChild(new Element('tbody')); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    click() { this.listeners.click(); }
  }
  const elements = Object.fromEntries([
    'capacity-sprint-name', 'capacity-sprint-dates', 'capacity-pace-badge', 'capacity-pace-card',
    'capacity-pace-summary', 'capacity-pace-burnrate', 'capacity-pace-breakdown', 'capacity-pace-bar',
    'capacity-team-summary', 'capacity-sprint-start', 'capacity-sprint-end',
    'capacity-total-points', 'capacity-total-issues', 'capacity-table-body', 'future-sprint-capacities',
    'no-sprint-capacity', 'past-sprint-open-capacity'
  ].map(id => [id, new Element()]));
  const future = {
    sprintName: 'Sprint 13', totalStoryPoints: 4, totalIssues: 1,
    developers: [{
      developer: 'Avery', issueCount: 1, storyPoints: 4, completedPoints: 0, inProgressPoints: 0, notStartedPoints: 4,
      capacity: 5, remaining: 1,
      issues: [{ jiraKey: 'TEAM-13', summary: 'Prepare next release', issueType: 'Story', status: 'To Do', storyPoints: 4, workState: 'notStarted' }]
    }]
  };
  const state = {
    allData: {
      sprintCapacity: {
        sprintName: 'Sprint 12', sprintStart: '2026-11-02T00:00:00.000Z', sprintEnd: '2026-11-13T23:59:59.000Z',
        totalStoryPoints: 4, completedPoints: 2, inProgressPoints: 1, notStartedPoints: 1, totalIssues: 3, totalCapacity: 2,
        pace: { status: 'on_track', label: 'On track', timeElapsedPct: 0.5, timeRemainingPct: 0.5, completedPct: 0.5, activePct: 0.75, delta: 0, remainingPoints: 2, remainingIssues: 1, requiredPointsPerDay: 0.4, expectedPointsPerDay: 0.4, totalDays: 10, daysElapsed: 5, daysRemaining: 5, unit: 'workdays', metricBasis: 'points' },
        developers: [
          {
            developer: 'Avery', issueCount: 2, storyPoints: 3, completedPoints: 2, inProgressPoints: 1, notStartedPoints: 0,
            capacity: 2, remaining: -1,
            pace: { status: 'on_track', label: 'On track' },
            issues: [
              { jiraKey: 'TEAM-12', summary: 'Release fixes', issueType: 'Custom work item', status: 'Done', storyPoints: 2, workState: 'completed' },
              { jiraKey: 'TEAM-16', summary: 'QA pass', issueType: 'Story', status: 'In Progress', storyPoints: 1, workState: 'inProgress' }
            ]
          },
          { developer: 'Blair', issueCount: 0, storyPoints: 0, capacity: null, remaining: null, issues: [] },
          {
            developer: 'Casey', issueCount: 1, storyPoints: 1, completedPoints: 0, inProgressPoints: 0, notStartedPoints: 1,
            capacity: 0, remaining: -1,
            pace: { status: 'behind', label: 'Behind' },
            issues: [{ jiraKey: 'TEAM-15', summary: 'Verify release', issueType: 'Task', status: 'Open', storyPoints: 1, workState: 'notStarted' }]
          },
          { developer: 'Drew', issueCount: 0, storyPoints: 0, capacity: 0, remaining: 0, issues: [] },
          {
            developer: 'Unassigned', issueCount: 1, storyPoints: 0, capacity: null, remaining: null,
            issues: [{ jiraKey: 'TEAM-14', summary: 'Fix login', issueType: 'Bug', status: 'Open', storyPoints: 0, workState: 'notStarted' }]
          }
        ]
      },
      futureSprintCapacity: [future],
      noSprintCapacity: {
        totalIssues: 1, totalStoryPoints: 3, unestimatedIssues: 0,
        developers: [{
          developer: 'Unassigned', issueCount: 1, storyPoints: 3, inProgressPoints: 0, notStartedPoints: 3, unestimatedCount: 0,
          issues: [{ jiraKey: 'BACK-1', summary: 'Unscheduled story', issueType: 'Story', status: 'To Do', storyPoints: 3, workState: 'notStarted' }]
        }]
      },
      pastSprintOpenCapacity: {
        totalIssues: 1, totalStoryPoints: 2, unestimatedIssues: 0,
        issues: [{ jiraKey: 'OLD-1', summary: 'Carryover bug', issueType: 'Bug', status: 'In Progress', assignee: 'Blair', sprintName: 'Sprint 11', storyPoints: 2, workState: 'inProgress' }]
      }
    }
  };
  const context = vm.createContext({
    window: { addEventListener() { } }, APP_STATE: state,
    Intl: {
      NumberFormat: function (_, options) { return new Intl.NumberFormat('en-US', options); },
      DateTimeFormat: function (_, options) { return new Intl.DateTimeFormat('en-US', options); }
    },
    document: { getElementById: id => elements[id], createElement: tag => new Element(tag) }
  });
  vm.runInContext(readFileSync(new URL('../src/client/ui.js', import.meta.url), 'utf8'), context);
  context.renderCapacityView();
  assert.equal(elements['capacity-sprint-name'].textContent, 'Sprint 12');
  assert.equal(elements['capacity-pace-badge'].textContent, 'On track');
  assert.match(elements['capacity-pace-summary'].textContent, /On track.*50% points completed vs\. 50% time elapsed/);
  assert.match(elements['capacity-pace-burnrate'].textContent, /2 pts remaining · 5 workdays left \(0\.4 pts\/day needed vs\. 0\.4 pts\/day target\)/);
  assert.match(elements['capacity-sprint-dates'].textContent, /Day 5 of 10 workdays/);
  assert.deepEqual(elements['capacity-pace-bar'].children[0].children.map(s => s.attributes['data-segment']), ['completed', 'inProgress', 'notStarted']);
  assert.equal(elements['capacity-pace-bar'].children[1].attributes['data-marker'], 'elapsed');
  assert.equal(elements['capacity-pace-bar'].children[1].style.left, '50%');
  const [heading, section] = elements['future-sprint-capacities'].children;
  assert.equal(heading.textContent, 'Future sprints');
  assert.equal(section.children[0].textContent, 'Sprint 13');
  assert.match(section.children[1].textContent, /4 story points.*1 issue/);
  const table = section.children[2].children[0];
  const [currentRow, currentDetails, emptyRow, emptyDetails, zeroCapRow, , zeroLoadRow, , unassignedRow, unassignedDetails] =
    elements['capacity-table-body'].children;
  const [futureRow, futureDetails] = table.children[1].children;
  assert.deepEqual(futureRow.children.slice(1, 5).map(cell => cell.textContent), ['1', '4', '5', '1']);
  const [currentPercent, warning, currentPacePill, currentTrack, currentCaption] = currentRow.children[5].children;
  assert.equal(currentPercent.textContent, '150%');
  assert.equal(warning.textContent, 'Over capacity');
  assert.equal(currentPacePill.textContent, 'On track');
  assert.deepEqual(currentTrack.children[0].children.map(s => s.attributes['data-segment']), ['completed', 'inProgress']);
  assert.equal(currentTrack.children[1].attributes['data-marker'], 'capacity-limit');
  assert.equal(currentCaption.textContent, '2 done · 1 active');
  const [futurePercent, futureTrack, futureCaption] = futureRow.children[5].children;
  assert.equal(futurePercent.textContent, '80%');
  assert.equal(futureTrack.children[0].children[0].style.width, '80%');
  assert.equal(futureCaption.textContent, '4 to do');
  const [emptyName, emptyToggle] = emptyRow.children[0].children;
  assert.equal(emptyName.textContent, 'Blair');
  assert.equal(emptyToggle.children[0].textContent, 'Issues (0)');
  assert.equal(emptyDetails.hidden, true);
  emptyToggle.click();
  assert.equal(emptyDetails.hidden, false);
  assert.equal(emptyDetails.children[0].textContent, 'No issues assigned for this sprint.');
  assert.equal(emptyRow.children[5].textContent, 'Capacity not set');
  assert.deepEqual(zeroCapRow.children[5].children.map(child => child.textContent), ['Over capacity', 'Behind']);
  assert.deepEqual(zeroLoadRow.children[5].children.map(child => child.textContent), ['Zero capacity']);
  assert.equal(unassignedRow.children[5].textContent, 'Needs assignee');
  const currentToggle = currentRow.children[0].children[1];
  const futureToggle = futureRow.children[0].children[1];
  assert.equal(currentToggle.children[0].textContent, 'Issues (2)');
  assert.equal(futureToggle.children[0].textContent, 'Issues (1)');
  assert.equal(currentDetails.hidden, true);
  assert.equal(futureDetails.hidden, true);
  assert.equal(futureToggle.attributes['aria-expanded'], 'false');
  assert.equal(futureToggle.attributes['aria-controls'], futureDetails.id);
  assert.notEqual(currentDetails.id, futureDetails.id);
  currentToggle.click();
  assert.equal(currentDetails.hidden, false);
  assert.equal(futureDetails.hidden, true);
  futureToggle.click();
  assert.equal(futureDetails.hidden, false);
  assert.equal(futureToggle.attributes['aria-expanded'], 'true');
  const storyCells = details => details.children[0].children[0].children[1].children[0].children;
  assert.equal(unassignedDetails.hidden, true);
  const unassignedToggle = unassignedRow.children[0].children[1];
  assert.equal(unassignedToggle.children[0].textContent, 'Issues (1)');
  unassignedToggle.click();
  assert.equal(unassignedDetails.hidden, false);
  assert.deepEqual(storyCells(unassignedDetails).slice(1).map(cell => cell.textContent), ['Fix login', 'Bug', 'Open', '0']);
  assert.equal(storyCells(currentDetails)[0].children[0].textContent, 'TEAM-12');
  assert.equal(storyCells(currentDetails)[2].textContent, 'Custom work item');
  const openedStories = [];
  context.openStoryInfoModal = jiraId => openedStories.push(jiraId);
  const [key, ...fields] = storyCells(futureDetails);
  assert.equal(key.children[0].tag, 'button');
  assert.equal(key.children[0].textContent, 'TEAM-13');
  key.children[0].click();
  assert.deepEqual(openedStories, ['TEAM-13']);
  assert.deepEqual(fields.map(cell => cell.textContent), ['Prepare next release', 'Story', 'To Do', '4']);
  futureToggle.click();
  assert.equal(futureDetails.hidden, true);
  assert.equal(currentDetails.hidden, false);
  state.allData.futureSprintCapacity = [];
  context.renderCapacityView();
  assert.equal(elements['future-sprint-capacities'].children.length, 0);
  assert.equal(elements['no-sprint-capacity'].children[0].textContent, 'No sprint assigned');
  assert.match(elements['no-sprint-capacity'].children[1].textContent, /3 story points · 1 open issue/);
  assert.equal(elements['past-sprint-open-capacity'].children[0].children[0].textContent, 'Open items in past sprints');
  assert.equal(elements['past-sprint-open-capacity'].children[0].children[1].textContent, '1 open');
  const pastKeyBtn = elements['past-sprint-open-capacity'].children[2].children[0].children[1].children[0].children[0].children[0];
  assert.equal(pastKeyBtn.tag, 'button');
  pastKeyBtn.click();
  assert.deepEqual(openedStories, ['TEAM-13', 'OLD-1']);
});

test('configuration footer keeps inactive actions and asynchronous statuses hidden', () => {
  const ids = ['saveConfigBtn', 'configStatus', 'save-developer-capacity',
    'developer-capacity-status', 'save-users', 'users-status'];
  const elements = Object.fromEntries(ids.map(id => [id, { classList: fakeClassList() }]));
  const context = vm.createContext({
    window: {},
    document: { getElementById: id => elements[id] }
  });
  vm.runInContext(readFileSync(new URL('../src/client/Config.js', import.meta.url), 'utf8'), context);

  context.syncConfigFooter_('#tab-users');
  assert.equal(elements['save-users'].classList.contains('hidden'), false);
  assert.equal(elements.saveConfigBtn.classList.contains('hidden'), true);
  assert.equal(elements['save-developer-capacity'].classList.contains('hidden'), true);

  context.syncConfigFooter_('#tab-dropdowns');
  context.setUsersStatus_('Users loaded.', 'neutral');
  context.setConfigStatusTone_(elements['developer-capacity-status'], 'success');
  assert.equal(elements['users-status'].classList.contains('hidden'), true);
  assert.equal(elements['developer-capacity-status'].classList.contains('hidden'), true);
  assert.equal(elements.configStatus.classList.contains('hidden'), false);
  assert.equal(elements.saveConfigBtn.classList.contains('hidden'), false);
});

test('dashboard initialization script and index.html inline scripts have valid syntax', () => {
  new vm.Script(readFileSync(new URL('../src/client/dashboard-init.js', import.meta.url), 'utf8'));
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const body = match[1].trim();
    if (body) new vm.Script(body);
  }
});

test('capacity view groups developers by manager with rolled-up workload when toggled', () => {
  class Element {
    constructor(tag = '') {
      this.tag = tag; this.children = []; this.textContent = ''; this.attributes = {}; this.listeners = {}; this.style = {}; this.dataset = {};
    }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren() { this.children = []; }
    insertRow() { return this.appendChild(new Element('tr')); }
    insertCell() { return this.appendChild(new Element('td')); }
    createTHead() { return this.appendChild(new Element('thead')); }
    createTBody() { return this.appendChild(new Element('tbody')); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    click() { if (this.listeners.click) this.listeners.click(); }
  }
  const elements = Object.fromEntries([
    'capacity-sprint-name', 'capacity-total-points', 'capacity-total-issues',
    'capacity-table-body', 'capacity-group-by-manager', 'future-sprint-capacities'
  ].map(id => [id, new Element()]));
  const state = {
    allData: {
      sprintCapacity: {
        sprintName: 'Sprint 20', totalStoryPoints: 14, totalIssues: 3, totalCapacity: 15,
        developers: [
          { developer: 'Avery', manager: 'Jordan', issueCount: 1, storyPoints: 6, completedPoints: 3, inProgressPoints: 3, notStartedPoints: 0, capacity: 5, remaining: -1, issues: [{ jiraKey: 'T-1', summary: 'A', issueType: 'Story', status: 'Done', storyPoints: 6, workState: 'completed' }] },
          { developer: 'Blair', manager: 'Jordan', issueCount: 1, storyPoints: 4, completedPoints: 4, inProgressPoints: 0, notStartedPoints: 0, capacity: 5, remaining: 1, issues: [{ jiraKey: 'T-2', summary: 'B', issueType: 'Story', status: 'Done', storyPoints: 4, workState: 'completed' }] },
          { developer: 'Casey', manager: '', issueCount: 1, storyPoints: 4, completedPoints: 0, inProgressPoints: 0, notStartedPoints: 4, capacity: 5, remaining: 1, issues: [{ jiraKey: 'T-3', summary: 'C', issueType: 'Story', status: 'To Do', storyPoints: 4, workState: 'notStarted' }] }
        ]
      },
      futureSprintCapacity: []
    }
  };
  const context = vm.createContext({
    window: { addEventListener() { } }, APP_STATE: state,
    Intl: { NumberFormat: function (_, options) { return new Intl.NumberFormat('en-US', options); } },
    document: { getElementById: id => elements[id], createElement: tag => new Element(tag) }
  });
  vm.runInContext(readFileSync(new URL('../src/client/ui.js', import.meta.url), 'utf8'), context);
  context.renderCapacityView();
  // Toggle Group by manager ON
  elements['capacity-group-by-manager'].click();
  assert.equal(elements['capacity-group-by-manager'].attributes['aria-pressed'], 'true');
  const groupRows = elements['capacity-table-body'].children.filter(r => r.attributes['data-manager-group']);
  assert.deepEqual(groupRows.map(r => r.attributes['data-manager-group']), ['Jordan', 'No manager assigned']);
  assert.equal(groupRows[0].children[0].textContent, 'Jordan (2 devs)');
  assert.equal(groupRows[0].children[2].textContent, '10'); // 6 + 4 pts
  assert.equal(groupRows[0].children[3].textContent, '10'); // 5 + 5 cap
  assert.equal(groupRows[0].children[4].textContent, '0');  // 0 remaining
});

test('capacity planner displays PTO, holiday, and manual override breakdowns per sprint', () => {
  class Element {
    constructor(tag = '') {
      this.tag = tag; this.children = []; this.textContent = ''; this.attributes = {}; this.listeners = {}; this.style = {}; this.dataset = {};
    }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren() { this.children = []; }
    insertRow() { return this.appendChild(new Element('tr')); }
    insertCell() { return this.appendChild(new Element('td')); }
    createTHead() { return this.appendChild(new Element('thead')); }
    createTBody() { return this.appendChild(new Element('tbody')); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
  }
  const elements = Object.fromEntries([
    'capacity-sprint-name', 'capacity-total-points', 'capacity-total-issues',
    'capacity-table-body', 'future-sprint-capacities'
  ].map(id => [id, new Element()]));
  const state = {
    allData: {
      sprintCapacity: {
        sprintName: 'Sprint 12', totalStoryPoints: 6, totalIssues: 1, totalCapacity: 7, holidayDays: 1, totalPtoDays: 2,
        developers: [
          {
            developer: 'Avery', issueCount: 1, storyPoints: 6, capacity: 7, baseCapacity: 10,
            ptoDays: 2, holidayDays: 1, overrideNotes: 'Vacation May 26-27', remaining: 1, issues: []
          },
          {
            developer: 'Blair', issueCount: 0, storyPoints: 0, capacity: 5, baseCapacity: 10,
            capacityOverride: 5, overrideNotes: '50% Auth team', remaining: 5, issues: []
          }
        ]
      },
      futureSprintCapacity: []
    }
  };
  const context = vm.createContext({
    window: { addEventListener() { } }, APP_STATE: state,
    Intl: { NumberFormat: function (_, options) { return new Intl.NumberFormat('en-US', options); } },
    document: { getElementById: id => elements[id], createElement: tag => new Element(tag) }
  });
  vm.runInContext(readFileSync(new URL('../src/client/ui.js', import.meta.url), 'utf8'), context);
  context.renderCapacityView();
  const [averyRow, , blairRow] = elements['capacity-table-body'].children;
  assert.equal(averyRow.children[3].children[0].textContent, '7');
  assert.equal(averyRow.children[3].children[1].textContent, 'of 10 (-2d PTO, -1d Hol)');
  assert.equal(averyRow.children[3].children[1].title, 'Vacation May 26-27');
  assert.equal(blairRow.children[3].children[0].textContent, '5');
  assert.equal(blairRow.children[3].children[1].textContent, 'of 10 (Override)');
});

test('developer capacity config interactive buttons add company holidays and per-developer sprint PTO', async () => {
  class Element {
    constructor(tag = '') {
      this.tag = tag; this.children = []; this.textContent = ''; this.value = '';
      this.attributes = {}; this.listeners = {}; this.style = {}; this.dataset = {};
      this.validity = { valid: true }; this.classList = fakeClassList();
    }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren() { this.children = []; }
    insertRow() { return this.appendChild(new Element('tr')); }
    insertCell() { return this.appendChild(new Element('td')); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    click() {
      if (typeof this.onclick === 'function') this.onclick();
      if (this.listeners.click) this.listeners.click();
    }
  }
  const elements = {
    'developer-capacity-body': new Element('tbody'),
    'developer-capacity-status': new Element('p'),
    'save-developer-capacity': new Element('button'),
    'developer-sprint-workdays': Object.assign(new Element('input'), { value: '10' }),
    'add-company-holiday-btn': new Element('button'),
    'developer-company-holidays-list': new Element('div'),
    'developer-sprint-options': new Element('datalist'),
    'developer-manager-options': new Element('datalist')
  };
  const data = {
    projects: [{ Assignee: 'Avery' }],
    sprintCapacity: { sprintName: 'Sprint 12', developers: [] },
    futureSprintCapacity: [{ sprintName: 'Sprint 13', developers: [] }],
    developerCapacity: [{ developer: 'Avery', capacity: 10, manager: 'Jordan' }],
    capacitySettings: { sprintWorkdays: 10, companyHolidays: [] }
  };
  const calls = [];
  const context = vm.createContext({
    window: { addEventListener() { } },
    document: {
      getElementById: id => elements[id],
      createElement: tag => new Element(tag),
      querySelectorAll: selector => {
        const devRows = elements['developer-capacity-body'].children.filter(r => r.children.length === 4);
        if (selector.includes('data-developer-manager')) {
          return devRows.map(r => r.children[1].children[0]);
        }
        return devRows.map(r => r.children[2].children[0]);
      }
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

  // 1. Click "+ Add holiday" and set name + date
  elements['add-company-holiday-btn'].click();
  assert.equal(elements['developer-company-holidays-list'].children.length, 1);
  const holidayRow = elements['developer-company-holidays-list'].children[0];
  holidayRow.children[0].value = 'Memorial Day';
  holidayRow.children[0].listeners.input();
  holidayRow.children[1].value = '2026-05-25';
  holidayRow.children[1].listeners.input();

  // 2. Click Avery's "PTO & overrides" toggle button -> expands subpanel row
  const [averyRow, averyPtoRow] = elements['developer-capacity-body'].children;
  const ptoToggleBtn = averyRow.children[3].children[0];
  assert.equal(averyPtoRow.hidden, true);
  ptoToggleBtn.click();
  assert.equal(averyPtoRow.hidden, false);

  // 3. Click "+ Add PTO date" AND "+ Add manual PTO / override" inside Avery's subpanel
  const ptoPanelWrapper = averyPtoRow.children[0].children[0];
  const btnGroup = ptoPanelWrapper.children[0].children[1];
  const addPtoDateBtn = btnGroup.children[0];
  addPtoDateBtn.click();
  const dateRow = ptoPanelWrapper.children[1].children[0];
  dateRow.children[0].children[1].value = '2026-05-26';
  dateRow.children[0].children[1].listeners.input();

  const updatedBtnGroup = ptoPanelWrapper.children[0].children[1];
  const addManualPtoBtn = updatedBtnGroup.children[1];
  addManualPtoBtn.click();
  assert.equal(ptoToggleBtn.textContent, 'PTO & overrides (2)');

  // 4. Save capacity and verify payload includes date-based holiday, date-based PTO, and manual sprint PTO
  context.saveDeveloperCapacity({ preventDefault() { } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    method: 'saveDeveloperCapacity',
    args: [
      [
        {
          developer: 'Avery',
          capacity: '10',
          manager: 'Jordan',
          sprintOverrides: {
            'Sprint 12': { ptoDays: 1, capacityOverride: null, notes: '' }
          },
          ptoDates: [
            { startDate: '2026-05-26', endDate: '2026-05-26', days: null, notes: '' }
          ]
        }
      ],
      {
        sprintWorkdays: 10,
        companyHolidays: [{ name: 'Memorial Day', sprint: 'Sprint 12', date: '2026-05-25', days: 1 }]
      }
    ]
  });
});
