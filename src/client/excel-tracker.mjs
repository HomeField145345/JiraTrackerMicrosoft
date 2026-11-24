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
      const { driveId, folderId, fileName, folderPath } = value.target;
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
      if (fileName !== undefined && (typeof fileName !== 'string' || fileName !== fileName.trim() ||
        fileName.length <= '.xlsx'.length || !/\.xlsx$/i.test(fileName) || /[/\\:*?"<>|]/.test(fileName))) {
        problems.push('target.fileName must be an .xlsx filename, not a path or link');
      }
      if (folderPath !== undefined) {
        if (typeof folderPath !== 'string' || folderPath.split('/').some(part =>
          !part || part !== part.trim() || part.endsWith('.') || /[\\:*?"<>|]/.test(part))) {
          problems.push('target.folderPath must be relative to the work OneDrive root, e.g. Documents/Tracking');
        }
        if (fileName === undefined || driveId !== undefined || folderId !== undefined) {
          problems.push('target.folderPath requires target.fileName and must not be used with SharePoint drive or folder IDs');
        }
      }
    }
  }

  return problems;
}

async function run(action, getPayload) {
  if (!client || busy) return;
  busy = true;
  element('workbook').setAttribute('aria-busy', 'true');
  element('status').textContent = 'Connecting to Excel…';
  let stage = 'authentication';
  try {
    console.info('[Excel tracker] Authentication started', {
      action,
      method: action === 'connect' ? 'popup' : 'silent',
      scopes
    });
    const auth = action === 'connect' ?
      await client.acquireTokenPopup({ scopes, account, prompt: account ? undefined : 'select_account' }) :
      await client.acquireTokenSilent({ scopes, account });
    console.info('[Excel tracker] Authentication completed', { action });
    stage = 'owner verification';
    const claims = auth.account?.idTokenClaims;
    if (claims?.oid?.toLowerCase() !== config.ownerObjectId.toLowerCase() ||
      claims?.tid?.toLowerCase() !== config.tenantId.toLowerCase()) {
      throw new Error('Sign in with the Microsoft account configured as the tracker owner.');
    }
    account = auth.account;
    client.setActiveAccount(account);
    stage = 'preparing request';
    const payload = getPayload ? await getPayload() : undefined;
    stage = 'workbook operation';
    console.info('[Excel tracker] Workbook operation started', { action });
    const result = await request(action, auth.accessToken, payload);
    console.info('[Excel tracker] Workbook operation completed', { action, created: result.created });
    stage = 'rendering';
    itemId = result.itemId;
    const fileLink = element('workbook-link');
    fileLink.hidden = !result.webUrl?.startsWith('https://');
    if (!fileLink.hidden) fileLink.href = result.webUrl;
    element('workbook').hidden = false;
    element('configure').hidden = !result.needsSetup;
    element('workspace').hidden = Boolean(result.needsSetup);
    if (result.needsSetup) {
      element('status').textContent = `Connected to ${config.target.fileName}. Set up the workbook to add the required tabs and headers.`;
      return;
    }
    renderRows('jira', result.projects.projects, ['Jira #', 'Summary', 'Status', 'Assignee']);
    renderRows('tasks', result.projects.independentTasks, ['Title', 'Status']);
    element('status').textContent = result.message || (result.created ? 'Workbook created.' : 'Workbook connected.');
    if (action === 'addTask') element('task-form').reset();
    if (action === 'import') element('import-form').reset();
  } catch (error) {
    const errorCode = typeof error.errorCode === 'string' && /^[a-z0-9_]{1,80}$/i.test(error.errorCode) ?
      error.errorCode : undefined;
    const aadstsCode = typeof error.message === 'string' ? error.message.match(/\bAADSTS\d+\b/i)?.[0] : undefined;
    const httpStatus = stage === 'workbook operation' && typeof error.message === 'string' ?
      error.message.match(/\(Microsoft HTTP (\d{3})\)/)?.[1] : undefined;
    console.error('[Excel tracker] Operation failed', {
      action, stage, errorCode, aadstsCode, httpStatus,
      correlationId: isGuid(error.correlationId) ? error.correlationId : undefined
    });
    element('status').textContent = error.name === 'InteractionRequiredAuthError' ?
      'Sign in again, then retry.' : error.message;
  } finally {
    busy = false;
    element('workbook').setAttribute('aria-busy', 'false');
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
      cache: { cacheLocation: 'sessionStorage' }
    });
    await app.initialize();
    client = app;
    account = app.getAllAccounts().find(cachedAccount =>
      cachedAccount.idTokenClaims?.oid?.toLowerCase() === config.ownerObjectId.toLowerCase() &&
      cachedAccount.idTokenClaims?.tid?.toLowerCase() === config.tenantId.toLowerCase()
    );
    element('status').textContent = config.target?.fileName ?
      `Sign in to connect to ${config.target.fileName}.` : 'Sign in to create or open your tracker workbook.';
    element('connect').hidden = false;
    if (account) await run('refresh');
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
element('configure').onclick = () => {
  if (!busy && confirm(`Set up ${config.target.fileName} as a ProjectHub workbook? This replaces the file contents with the tracker layout. Keep a backup and close the file in Excel before continuing.`)) {
    return run('configure');
  }
};
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
