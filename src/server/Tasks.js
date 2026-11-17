/**
 * @file Tasks.js
 * @description Independent task management (create, update, delete, complete, recurrence).
 *
 * Google Tasks sync (GoogleTasksSync.js in the Apps Script project) is disabled in the
 * browser-only build. Tasks are stored in the IndependentTasks worksheet only. The TaskListId and
 * GoogleTaskId columns are kept so existing workbook data stays compatible; a Microsoft To Do sync
 * can be added here later.
 */

// ─────────────────────────────────────────────
// 1. SINGLE TASK CRUD
// ─────────────────────────────────────────────

function createTaskAndSync_(taskData, user) {
  var username = String((user && user.username) || '').trim();
  var localId = 'LOCAL-' + Platform.uuid();

  var ss = getDataSpreadsheet(user, true);
  var sheet = getSheetOrThrow(ss, INDEPENDENT_TASKS_SHEET);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = buildHeaderIndex_(headers);
  ensureColumns_(sheet, headers, idx);
  headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  idx = buildHeaderIndex_(headers);

  var row = headers.map(function() { return ''; });
  setCell_(row, idx, 'ID', localId);
  setCell_(row, idx, 'Title', taskData.Title || '');
  setCell_(row, idx, 'Assignee', taskData.Assignee || username);
  setCell_(row, idx, 'Owner', username);
  setCell_(row, idx, 'Status', taskData.Status || 'Open');
  setCell_(row, idx, 'Priority', taskData.Priority || 'Medium');
  setCell_(row, idx, 'Due', taskData.Due || '');
  setCell_(row, idx, 'Description', taskData.Description || '');
  setCell_(row, idx, 'Tags', taskData.Tags || '');
  setCell_(row, idx, 'Project', taskData.Project || '');
  setCell_(row, idx, 'Recurrence', taskData.Recurrence || '');
  setCell_(row, idx, 'Created', new Date().toISOString());
  setCell_(row, idx, 'Updated', new Date().toISOString());

  sheet.appendRow(row);
  clearProjectCache();

  return { status: 'success', taskId: localId, message: 'Task created.' };
}

function updateTaskAndSync_(taskData, user) {
  var localId = taskData.ID;
  if (!localId) throw new Error('Task ID is required for update.');

  var ss = getDataSpreadsheet(user, true);
  var sheet = getSheetOrThrow(ss, INDEPENDENT_TASKS_SHEET);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = buildHeaderIndex_(headers);

  var rowNum = findTaskRow_(sheet, headers, localId);
  if (!rowNum) {
    // Debug: log all IDs to help diagnose mismatch
    var lastRow = sheet.getLastRow();
    var allIds = lastRow > 1 ? sheet.getRange(2, idx['ID'] + 1, lastRow - 1, 1).getValues().map(function(r) { return String(r[0]); }) : [];
    console.debug('findTaskRow_ failed for "' + localId + '". Sheet has ' + allIds.length + ' rows. IDs: ' + JSON.stringify(allIds.slice(0, 20)));
    throw new Error('Task not found: ' + localId);
  }

  var existingRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  if (taskData.Title !== undefined)       setCell_(existingRow, idx, 'Title', taskData.Title);
  if (taskData.Status !== undefined)      setCell_(existingRow, idx, 'Status', taskData.Status);
  if (taskData.Priority !== undefined)    setCell_(existingRow, idx, 'Priority', taskData.Priority);
  if (taskData.Due !== undefined)         setCell_(existingRow, idx, 'Due', taskData.Due);
  if (taskData.Description !== undefined) setCell_(existingRow, idx, 'Description', taskData.Description);
  if (taskData.Tags !== undefined)        setCell_(existingRow, idx, 'Tags', taskData.Tags);
  if (taskData.Assignee !== undefined)    setCell_(existingRow, idx, 'Assignee', taskData.Assignee);
  if (taskData.Project !== undefined)     setCell_(existingRow, idx, 'Project', taskData.Project);
  if (taskData.Recurrence !== undefined)  setCell_(existingRow, idx, 'Recurrence', taskData.Recurrence);
  setCell_(existingRow, idx, 'Updated', new Date().toISOString());

  sheet.getRange(rowNum, 1, 1, existingRow.length).setValues([existingRow]);

  clearProjectCache();
  return { status: 'success', message: 'Task updated.' };
}

function deleteTaskAndSync_(taskId, user) {
  if (!taskId) throw new Error('Task ID is required.');

  var ss = getDataSpreadsheet(user, true);
  var sheet = getSheetOrThrow(ss, INDEPENDENT_TASKS_SHEET);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var rowNum = findTaskRow_(sheet, headers, taskId);
  if (!rowNum) throw new Error('Task not found: ' + taskId);

  sheet.deleteRow(rowNum);
  clearProjectCache();
  return { status: 'success', message: 'Task deleted.' };
}

function toggleTaskComplete_(taskId, user) {
  var ss = getDataSpreadsheet(user, true);
  var sheet = getSheetOrThrow(ss, INDEPENDENT_TASKS_SHEET);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = buildHeaderIndex_(headers);

  var rowNum = findTaskRow_(sheet, headers, taskId);
  if (!rowNum) throw new Error('Task not found: ' + taskId);

  var existingRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  var currentStatus = getCell_(existingRow, idx, 'Status');
  var newStatus = (currentStatus === 'Done') ? 'Open' : 'Done';

  setCell_(existingRow, idx, 'Status', newStatus);
  setCell_(existingRow, idx, 'Updated', new Date().toISOString());
  if (newStatus === 'Done') setCell_(existingRow, idx, 'CompletedDate', new Date().toISOString());

  sheet.getRange(rowNum, 1, 1, existingRow.length).setValues([existingRow]);

  // Handle recurrence
  var recurrence = getCell_(existingRow, idx, 'Recurrence');
  if (newStatus === 'Done' && recurrence) {
    spawnNextRecurrence_(existingRow, idx, headers, recurrence, user);
  }

  clearProjectCache();
  return { status: 'success', newStatus: newStatus, message: 'Task marked as ' + newStatus + '.' };
}

// ─────────────────────────────────────────────
// 2. RECURRENCE ENGINE
// ─────────────────────────────────────────────

function spawnNextRecurrence_(completedRow, idx, headers, recurrence, user) {
  var pattern = String(recurrence).toLowerCase().trim();
  var currentDue = getCell_(completedRow, idx, 'Due');
  var baseDate = currentDue ? new Date(currentDue) : new Date();
  if (isNaN(baseDate.getTime())) baseDate = new Date();

  var nextDate = new Date(baseDate);
  switch (pattern) {
    case 'daily':      nextDate.setDate(nextDate.getDate() + 1); break;
    case 'weekdays':
      do { nextDate.setDate(nextDate.getDate() + 1); } while (nextDate.getDay() === 0 || nextDate.getDay() === 6);
      break;
    case 'weekly':     nextDate.setDate(nextDate.getDate() + 7); break;
    case 'biweekly':   nextDate.setDate(nextDate.getDate() + 14); break;
    case 'monthly':    nextDate.setMonth(nextDate.getMonth() + 1); break;
    case 'quarterly':  nextDate.setMonth(nextDate.getMonth() + 3); break;
    case 'yearly':     nextDate.setFullYear(nextDate.getFullYear() + 1); break;
    default: return;
  }

  var nextDueStr = Platform.formatDate(nextDate, Platform.timeZone(), 'yyyy-MM-dd');

  createTaskAndSync_({
    Title: getCell_(completedRow, idx, 'Title'),
    Due: nextDueStr,
    Priority: getCell_(completedRow, idx, 'Priority'),
    Status: 'Open',
    Description: getCell_(completedRow, idx, 'Description'),
    Tags: getCell_(completedRow, idx, 'Tags'),
    Project: getCell_(completedRow, idx, 'Project'),
    Recurrence: recurrence
  }, user);
}

// ─────────────────────────────────────────────
// 3. SHEET UTILITIES
// ─────────────────────────────────────────────

function buildHeaderIndex_(headers) {
  var map = {};
  headers.forEach(function(h, i) { if (h) map[h] = i; });
  return map;
}

function setCell_(row, idx, col, val) {
  if (idx[col] !== undefined) row[idx[col]] = val;
}

function getCell_(row, idx, col) {
  return (idx[col] !== undefined) ? String(row[idx[col]] || '') : '';
}

function findTaskRow_(sheet, headers, taskId) {
  var idx = buildHeaderIndex_(headers);
  var idCol = idx['ID'];
  if (idCol === undefined) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === taskId) return i + 2;
  }
  return null;
}

function ensureColumns_(sheet, headers, idx) {
  var required = ['ID','Title','Assignee','Owner','Status','Priority','Due',
    'Description','Tags','Project','Recurrence','TaskListId','GoogleTaskId',
    'Created','Updated','CompletedDate'];
  required.forEach(function(col) {
    if (idx[col] === undefined) {
      var nextCol = headers.length + 1;
      sheet.getRange(1, nextCol).setValue(col);
      headers.push(col);
      idx[col] = nextCol - 1;
    }
  });
}
