/**
 * @file IndexedDbStorage.js
 * @description Browser-local workbook storage.
 *
 * Storage adapter contract used by ProjectHubServer (an Excel/Microsoft Graph adapter must match it):
 *   getRevision(): Promise<number>          - changes whenever any workbook is saved
 *   loadAll(): Promise<WorkbookData[]>      - every workbook as { id, name, sheets: [{ name, rows }] }
 *   saveChanges({ upserts }, revision): Promise<number> - persists changed workbooks, returns the new revision
 */

function IndexedDbStorage(databaseName) {
  this._databaseName = databaseName || 'projecthub';
  this._dbPromise = null;
}

IndexedDbStorage.WORKBOOK_STORE = 'workbooks';
IndexedDbStorage.META_STORE = 'meta';
IndexedDbStorage.REVISION_KEY = 'revision';

IndexedDbStorage.prototype._open = function () {
  if (this._dbPromise) return this._dbPromise;
  var name = this._databaseName;
  this._dbPromise = new Promise(function (resolve, reject) {
    var request = indexedDB.open(name, 1);
    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains(IndexedDbStorage.WORKBOOK_STORE)) {
        db.createObjectStore(IndexedDbStorage.WORKBOOK_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IndexedDbStorage.META_STORE)) {
        db.createObjectStore(IndexedDbStorage.META_STORE);
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error || new Error('Unable to open browser storage.')); };
    request.onblocked = function () { reject(new Error('Browser storage is blocked by another open tab. Close other tabs and try again.')); };
  });
  return this._dbPromise;
};

IndexedDbStorage.prototype._request = function (storeName, mode, operation) {
  return this._open().then(function (db) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(storeName, mode);
      var request = operation(transaction.objectStore(storeName));
      transaction.oncomplete = function () { resolve(request.result); };
      transaction.onerror = function () { reject(transaction.error || request.error); };
      transaction.onabort = function () { reject(transaction.error || new Error('Browser storage transaction was aborted.')); };
    });
  });
};

IndexedDbStorage.prototype.getRevision = function () {
  return this._request(IndexedDbStorage.META_STORE, 'readonly', function (store) {
    return store.get(IndexedDbStorage.REVISION_KEY);
  }).then(function (revision) {
    return Number(revision) || 0;
  });
};

IndexedDbStorage.prototype.loadAll = function () {
  return this._request(IndexedDbStorage.WORKBOOK_STORE, 'readonly', function (store) {
    return store.getAll();
  }).then(function (workbooks) {
    return workbooks || [];
  });
};

IndexedDbStorage.prototype.saveChanges = function (changes, revision) {
  var nextRevision = (Number(revision) || 0) + 1;
  return this._open().then(function (db) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction([IndexedDbStorage.WORKBOOK_STORE, IndexedDbStorage.META_STORE], 'readwrite');
      var workbookStore = transaction.objectStore(IndexedDbStorage.WORKBOOK_STORE);
      (changes.upserts || []).forEach(function (workbook) { workbookStore.put(workbook); });
      transaction.objectStore(IndexedDbStorage.META_STORE).put(nextRevision, IndexedDbStorage.REVISION_KEY);
      transaction.oncomplete = function () { resolve(nextRevision); };
      transaction.onerror = function () { reject(transaction.error || new Error('Unable to save browser storage.')); };
      transaction.onabort = function () { reject(transaction.error || new Error('Browser storage save was aborted.')); };
    });
  });
};
