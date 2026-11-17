/**
 * @file Server.js
 * @description Runs public API functions against the workbook store.
 *
 * Every call: (1) takes a cross-tab lock, (2) reloads workbooks if another tab saved changes,
 * (3) runs the API function, and (4) saves the workbooks it changed. Results are JSON-serialized,
 * matching the Apps Script client contract the UI was written for (for example, Dates become strings).
 */

var ProjectHubServer = (function () {
  var LOCK_NAME = 'projecthub-workbook-store';
  var storage = null;
  var loadedRevision = null;
  var queue = Promise.resolve();

  function configure(storageAdapter) {
    storage = storageAdapter;
    loadedRevision = null;
  }

  function withCrossTabLock_(task) {
    if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
      return navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, task);
    }
    return task();
  }

  function enqueue_(task) {
    var result = queue.then(function () { return withCrossTabLock_(task); });
    queue = result.catch(function () {});
    return result;
  }

  async function syncFromStorage_() {
    var revision = await storage.getRevision();
    if (revision !== loadedRevision) {
      WorkbookService.replaceAll(await storage.loadAll());
      Platform.cache().clear();
      loadedRevision = revision;
    }
    if (!WorkbookService.hasWorkbook(PRIMARY_WORKBOOK_ID)) {
      setupSheets(WorkbookService.getActiveWorkbook());
    }
  }

  async function persist_() {
    var changes = WorkbookService.takeChanges();
    if (!changes) return;
    try {
      loadedRevision = await storage.saveChanges(changes, loadedRevision);
    } catch (error) {
      // Force a reload on the next call so memory matches what was actually stored.
      loadedRevision = null;
      throw error;
    }
  }

  function toTransport_(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function call(method, args) {
    return enqueue_(async function () {
      if (!storage) throw new Error('Workbook storage is not configured.');
      if (!Object.prototype.hasOwnProperty.call(PUBLIC_API, method) || typeof PUBLIC_API[method] !== 'function') {
        throw new Error('Unknown server function: ' + method);
      }

      await syncFromStorage_();
      var result;
      try {
        result = PUBLIC_API[method].apply(null, Array.isArray(args) ? args : []);
      } finally {
        await persist_();
      }
      return toTransport_(result);
    });
  }

  return {
    configure: configure,
    call: call
  };
}());
