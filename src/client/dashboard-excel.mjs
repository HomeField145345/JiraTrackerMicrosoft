import { PublicClientApplication } from '@azure/msal-browser';

export const READ_ONLY_MESSAGE =
  "Editing from the dashboard isn't connected to Excel yet. Make the change in the workbook, then select Force Refresh.";

const isGuid = value =>
  typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

export function createExcelBridge({
  document: doc = globalThis.document,
  location: loc = globalThis.location,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  Worker: WorkerClass = globalThis.Worker,
  PublicClientApplication: Msal = PublicClientApplication
} = {}) {
  const element = id => doc.getElementById(id);
  let config;
  let client;
  let scopes;
  let account = null;
  let itemId;
  let workbookUrl = '';
  let worker;
  let pendingData = null;
  let queue = Promise.resolve();
  let busy = false;
  let resolveSignedIn;
  const signedIn = new Promise(resolve => { resolveSignedIn = resolve; });

  function setStatus(message) {
    const status = element('signin-status');
    if (status) status.textContent = message;
  }

  function showSignIn(message) {
    element('signin-panel')?.classList.remove('hidden');
    setStatus(message);
  }

  function runWorker(action, accessToken) {
    const task = queue.then(() => new Promise((resolve, reject) => {
      if (!worker) worker = new WorkerClass('./src/server/excel-worker.js');
      worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.result);
      worker.onerror = () => {
        worker.terminate();
        worker = null;
        reject(new Error('The Excel service could not start. Reload the page and try again.'));
      };
      worker.postMessage({ action, accessToken, target: config.target, itemId });
    }));
    queue = task.catch(() => {});
    return task;
  }

  function verifyOwner(auth) {
    const claims = auth.account?.idTokenClaims;
    if (claims?.oid?.toLowerCase() !== config.ownerObjectId.toLowerCase() ||
        claims?.tid?.toLowerCase() !== config.tenantId.toLowerCase()) {
      throw new Error('Sign in with the Microsoft account configured as the tracker owner.');
    }
    account = auth.account;
    return auth.accessToken;
  }

  function useResult(result) {
    if (result.needsSetup) {
      throw new Error('This workbook is not set up yet. Set it up in the Excel tracker, then sign in again.');
    }
    itemId = result.itemId;
    workbookUrl = typeof result.webUrl === 'string' && result.webUrl.startsWith('https://') ? result.webUrl : '';
    return result.projects;
  }

  async function signIn() {
    if (!client || busy) return;
    busy = true;
    element('signin-btn')?.setAttribute('disabled', '');
    setStatus('Connecting to Excel…');
    try {
      const auth = await client.acquireTokenPopup({ scopes, account: account || undefined, prompt: account ? undefined : 'select_account' });
      const accessToken = verifyOwner(auth);
      pendingData = useResult(await runWorker('connect', accessToken));
      element('signin-panel')?.classList.add('hidden');
      resolveSignedIn();
    } catch (error) {
      account = null;
      setStatus(error.name === 'BrowserAuthError' && /user_cancelled/.test(error.errorCode || '') ?
        'Sign-in was cancelled.' : error.message);
    } finally {
      busy = false;
      element('signin-btn')?.removeAttribute('disabled');
    }
  }

  async function refresh() {
    if (!account) throw new Error('Sign in with Microsoft to load the workbook.');
    let accessToken;
    try {
      accessToken = verifyOwner(await client.acquireTokenSilent({ scopes, account }));
    } catch (error) {
      if (error.name === 'InteractionRequiredAuthError') {
        showSignIn('Your Microsoft session expired. Sign in again to continue.');
        throw new Error('Your Microsoft session expired. Sign in again to continue.');
      }
      throw error;
    }
    return useResult(await runWorker('refresh', accessToken));
  }

  async function projectData() {
    if (pendingData) {
      const data = pendingData;
      pendingData = null;
      return data;
    }
    return refresh();
  }

  const readers = {
    getProjectData: projectData,
    forceGetProjectData: () => { pendingData = null; return refresh(); },
    getConfigData: async () => (await projectData()).config
  };

  function call(method, args) {
    const reader = Object.prototype.hasOwnProperty.call(readers, method) ? readers[method] : null;
    if (!reader) return Promise.reject(new Error(READ_ONLY_MESSAGE));
    return Promise.resolve().then(() => reader(...(Array.isArray(args) ? args : [])));
  }

  function user() {
    if (!account) return {};
    return {
      username: account.username,
      email: account.username,
      displayName: account.name || account.username,
      role: 'admin'
    };
  }

  function signOut() {
    account = null;
    pendingData = null;
    worker?.terminate();
    worker = null;
    loc.reload();
  }

  async function initialize() {
    element('signin-panel')?.classList.remove('hidden');
    try {
      const response = await fetchFn(new URL('./excel-config.json', loc.href), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load excel-config.json (HTTP ${response.status}).`);
      config = await response.json().catch(() => {
        throw new Error('The excel-config.json response is not valid JSON.');
      });
      if (!config || !['clientId', 'tenantId', 'ownerObjectId'].every(field => isGuid(config[field]))) {
        throw new Error('The Microsoft 365 setup is incomplete. Open the Excel tracker for details.');
      }
      scopes = [config.target?.driveId ? 'Files.ReadWrite.All' : 'Files.ReadWrite'];
      const app = new Msal({
        auth: {
          clientId: config.clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
          redirectUri: new URL('./excel-auth.html', loc.href).href
        },
        cache: { cacheLocation: 'memoryStorage' }
      });
      await app.initialize();
      client = app;
      const button = element('signin-btn');
      if (button) {
        button.hidden = false;
        button.onclick = signIn;
      }
      setStatus(config.target?.fileName ?
        `Sign in to load ${config.target.fileName}.` : 'Sign in to load your tracker workbook.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  return {
    initialize,
    signIn,
    signOut,
    call,
    user,
    whenSignedIn: () => signedIn,
    isSignedIn: () => Boolean(account),
    workbookUrl: () => workbookUrl
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const bridge = createExcelBridge();
  window.ProjectHubExcel = bridge;
  window.callServer = bridge.call;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bridge.initialize());
  } else {
    bridge.initialize();
  }
}
