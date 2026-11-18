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

const isGuid = value =>
  typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

function getConfigProblems(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['excel-config.json must contain a JSON object'];
  }

  const problems = [];
  for (const field of ['clientId', 'tenantId', 'ownerObjectId']) {
    if (!isGuid(value[field])) {
      problems.push(`${field} must be a valid GUID`);
    }
  }

  if (value.target !== undefined && value.target !== null) {
    if (typeof value.target !== 'object' || Array.isArray(value.target)) {
      problems.push('target must be a JSON object');
    } else {
      const { driveId, folderId } = value.target;
      const hasDriveId = typeof driveId === 'string' && driveId.trim() !== '';
      const hasFolderId = typeof folderId === 'string' && folderId.trim() !== '';
      if (hasDriveId !== hasFolderId) {
        problems.push('target.driveId and target.folderId must both be set, or both omitted');
      }
      if (driveId !== undefined && !hasDriveId) {
        problems.push('target.driveId must be a non-empty string');
      }
      if (folderId !== undefined && !hasFolderId) {
        problems.push('target.folderId must be a non-empty string');
      }
    }
  }

  return problems;
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
    const configUrl = new URL('./excel-config.json', location.href);
    console.info('[Excel tracker] Loading configuration', configUrl.href);
    const response = await fetch(configUrl, { cache: 'no-store' });
    const contentType = response.headers.get('content-type');
    console.info('[Excel tracker] Configuration response', {
      status: response.status,
      contentType
    });
    if (!response.ok) {
      throw new Error(`Could not load excel-config.json (HTTP ${response.status}).`);
    }

    try {
      config = await response.json();
    } catch (error) {
      console.error('[Excel tracker] Configuration response is not valid JSON', {
        contentType,
        message: error.message
      });
      throw new Error('The excel-config.json response is not valid JSON. Check the file or EXCEL_CONFIG Actions variable.');
    }

    const problems = getConfigProblems(config);
    console.info('[Excel tracker] Configuration field check', {
      clientIdValid: isGuid(config?.clientId),
      tenantIdValid: isGuid(config?.tenantId),
      ownerObjectIdValid: isGuid(config?.ownerObjectId),
      sharePointTargetConfigured: Boolean(config?.target?.driveId && config?.target?.folderId)
    });
    if (problems.length) {
      console.error('[Excel tracker] Configuration validation failed', { problems });
      throw new Error(`The Microsoft 365 setup is incomplete: ${problems.join('; ')}.`);
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
    console.error('[Excel tracker] Initialization failed', {
      name: error.name,
      message: error.message
    });
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
