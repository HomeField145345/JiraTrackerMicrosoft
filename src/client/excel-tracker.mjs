import { PublicClientApplication } from '@azure/msal-browser';

const element = id => document.getElementById(id);
let client;
let config;
let account;
let itemId;
let worker;
let busy = false;
let scopes;

function request(action, accessToken, payload) {
  return new Promise((resolve, reject) => {
    if (!worker) worker = new Worker('./src/server/excel-worker.js');
    worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.result);
    worker.onerror = () => {
      worker.terminate();
      worker = null;
      reject(new Error('The Excel service could not start. Reload the page and try again.'));
    };
    worker.postMessage({ action, accessToken, target: config.target, itemId, payload });
  });
}

function renderRows(id, records, keys) {
  const rows = document.createDocumentFragment();
  for (const record of records) {
    const row = rows.appendChild(document.createElement('tr'));
    for (const key of keys) row.insertCell().textContent = record[key] ?? '';
  }
  if (!records.length) {
    const cell = rows.appendChild(document.createElement('tr')).insertCell();
    cell.colSpan = keys.length;
    cell.textContent = 'No records yet.';
  }
  element(id).replaceChildren(rows);
}

async function run(action, getPayload) {
  if (!client || busy) return;
  busy = true;
  element('workspace').setAttribute('aria-busy', 'true');
  element('status').textContent = 'Connecting to Excel…';
  try {
    const auth = action === 'connect' ?
      await client.acquireTokenPopup({ scopes, account, prompt: account ? undefined : 'select_account' }) :
      await client.acquireTokenSilent({ scopes, account });
    const claims = auth.account?.idTokenClaims;
    if (claims?.oid?.toLowerCase() !== config.ownerObjectId.toLowerCase() ||
        claims?.tid?.toLowerCase() !== config.tenantId.toLowerCase()) {
      throw new Error('Sign in with the Microsoft account configured as the tracker owner.');
    }
    account = auth.account;
    const payload = getPayload ? await getPayload() : undefined;
    const result = await request(action, auth.accessToken, payload);
    itemId = result.itemId;
    const fileLink = element('workbook-link');
    if (result.webUrl?.startsWith('https://')) {
      fileLink.href = result.webUrl;
      fileLink.hidden = false;
    }
    renderRows('jira', result.projects.projects, ['Jira #', 'Summary', 'Status', 'Assignee']);
    renderRows('tasks', result.projects.independentTasks, ['Title', 'Status']);
    element('workspace').hidden = false;
    element('status').textContent = result.message || (result.created ? 'Workbook created.' : 'Workbook connected.');
    if (action === 'addTask') element('task-form').reset();
    if (action === 'import') element('import-form').reset();
  } catch (error) {
    element('status').textContent = error.name === 'InteractionRequiredAuthError' ?
      'Sign in again, then retry.' : error.message;
  } finally {
    busy = false;
    element('workspace').setAttribute('aria-busy', 'false');
  }
}

async function initialize() {
  try {
    const response = await fetch('./excel-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Excel is not configured. Follow the Microsoft 365 setup guide.');
    config = await response.json();
    const guid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    if (![config.clientId, config.tenantId, config.ownerObjectId].every(value => guid.test(value)) ||
        Boolean(config.target?.driveId) !== Boolean(config.target?.folderId)) {
      throw new Error('The Microsoft 365 setup is incomplete. Check the tenant, app, owner, and destination IDs.');
    }
    scopes = [config.target?.driveId ? 'Files.ReadWrite.All' : 'Files.ReadWrite'];
    const app = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        redirectUri: new URL('./excel-auth.html', location.href).href
      },
      cache: { cacheLocation: 'memoryStorage' }
    });
    await app.initialize();
    client = app;
    element('status').textContent = 'Sign in to create or open your tracker workbook.';
    element('connect').hidden = false;
  } catch (error) {
    element('status').textContent = error.message;
  }
}

element('connect').onclick = () => run('connect');
element('refresh').onclick = () => run('refresh');
element('task-form').onsubmit = event => {
  event.preventDefault();
  run('addTask', () => element('title').value);
};
element('import-form').onsubmit = event => {
  event.preventDefault();
  const file = element('csv').files[0];
  if (!file || !/\.csv$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
    element('status').textContent = 'Select a Jira CSV file up to 10 MiB.';
    return;
  }
  run('import', () => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ fileName: file.name, base64Data: reader.result.split(',')[1] });
    reader.onerror = () => reject(new Error('Could not read the selected CSV file.'));
    reader.readAsDataURL(file);
  }));
};

initialize();
