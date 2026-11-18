importScripts('../../vendor/exceljs.min.js', 'manifest.js');
importScripts.apply(self, SERVER_SCRIPTS);
importScripts('platform/ExcelStorage.js');

async function runExcelOperation({ action, accessToken, target, itemId, payload }) {
  const storage = new ExcelStorage(accessToken, target);
  const { item, data, created } = await storage.open(action === 'connect', itemId);
  WorkbookService.replaceAll([data]);
  Platform.cache().clear();
  let message;
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
  }
  const changes = WorkbookService.takeChanges();
  if (changes) await storage.save(changes.upserts[0], item);
  const projects = _getRawProjectData(null);
  if (!projects) throw new Error('Could not read the tracker data from Excel.');
  return { itemId: item.id, webUrl: item.webUrl, created, message, projects };
}

self.onmessage = async function ({ data }) {
  try {
    if (!['connect', 'refresh', 'import', 'addTask'].includes(data.action) ||
        (data.action !== 'connect' && !data.itemId)) throw new Error('Connect a tracker workbook first.');
    if (!navigator.locks) throw new Error('Excel storage requires a browser with Web Locks support.');
    const result = await navigator.locks.request('projecthub-excel-store', () => runExcelOperation(data));
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
