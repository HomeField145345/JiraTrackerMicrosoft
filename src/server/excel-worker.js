importScripts('../../vendor/exceljs.min.js', 'manifest.js');
importScripts.apply(self, SERVER_SCRIPTS);
importScripts('platform/ExcelStorage.js');

async function runExcelOperation({ action, accessToken, target, itemId, payload, userObjectId, userEmail, ownerObjectId }) {
  const storage = new ExcelStorage(accessToken, target);
  if (action === 'configure' && (target?.fileName === undefined || !itemId)) {
    throw new Error('Connect to a specific existing workbook before setting it up.');
  }
  const { item, data, workbook, created, needsSetup } = await storage.open(action, itemId);
  const connection = { itemId: item.id, webUrl: item.webUrl, created };
  if (needsSetup && action !== 'configure') return { ...connection, needsSetup };
  if (needsSetup) await storage.configure(workbook, item);
  WorkbookService.replaceAll([data]);
  Platform.cache().clear();
  let currentUser = null;
  if (userObjectId) {
    try {
      currentUser = resolveMicrosoftUser(userObjectId, ownerObjectId, userEmail);
    } catch (error) {
      error.workbookUrl = item.webUrl;
      throw error;
    }
  }
  let response;
  let message = action === 'configure' ?
    (needsSetup ? 'Workbook set up.' : 'Workbook is already set up.') : undefined;
  if (action === 'import') {
    const result = importJiraCsv_(payload, null);
    if (result.status !== 'success') throw new Error(result.message);
    message = result.message;
  } else if (action === 'addTask') {
    if (typeof payload !== 'string' || !payload.trim() || payload.length > 200) {
      throw new Error('Enter a task title up to 200 characters.');
    }
    const result = saveIndependentTask_({ Title: payload.trim(), Status: 'Not started' }, null);
    if (result.status !== 'success') throw new Error(result.message);
    message = 'Task saved.';
  } else if (action === 'mutate') {
    const { method, args } = payload || {};
    if (!currentUser || !Array.isArray(args)) throw new Error('The workbook update request is invalid.');
    if (method === 'saveConfiguration' && currentUser.role !== 'admin') {
      throw new Error('Access denied: Admin rights required.');
    }
    const mutations = {
      importJiraCsv: values => importJiraCsv_(values[0], currentUser),
      importJiraFile: values => importJiraCsv_(values[0], currentUser),
      saveConfiguration: values => saveConfiguration_(values[0]),
      saveManualData: values => saveManualData_(values[0], values[1], values[2], currentUser),
      saveIndependentTask: values => saveIndependentTask_(values[0], currentUser),
      updateLastChecked: values => updateLastChecked_(values[0], currentUser),
      createTaskAndSync: values => createTaskAndSync_(values[0], currentUser),
      updateTaskAndSync: values => updateTaskAndSync_(values[0], currentUser),
      deleteTaskAndSync: values => deleteTaskAndSync_(values[0], currentUser),
      toggleTaskComplete: values => toggleTaskComplete_(values[0], currentUser)
    };
    if (!Object.hasOwn(mutations, method)) throw new Error('This workbook update is not supported.');
    response = mutations[method](args);
    if (response?.status === 'error') throw new Error(response.message || 'The workbook update failed.');
  }
  const changes = WorkbookService.takeChanges();
  if (changes) await storage.save(changes.upserts[0], item);
  const projects = currentUser ? getProjectData_(currentUser) : _getRawProjectData(null);
  if (!projects || projects.error) throw new Error(projects?.message || 'Could not read the tracker data from Excel.');
  return { ...connection, message, response, projects, user: currentUser };
}

self.onmessage = async function ({ data }) {
  try {
    if (!['connect', 'refresh', 'configure', 'import', 'addTask', 'mutate'].includes(data.action) ||
        (data.action !== 'connect' && !data.itemId)) throw new Error('Connect a tracker workbook first.');
    if (!navigator.locks) throw new Error('Excel storage requires a browser with Web Locks support.');
    const result = await navigator.locks.request('projecthub-excel-store', () => runExcelOperation(data));
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error.message, workbookUrl: error.workbookUrl });
  }
};
