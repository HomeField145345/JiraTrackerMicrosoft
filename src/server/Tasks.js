/**
 * @file GoogleTasksSync.js
 * @description Full bi-directional Google Tasks integration.
 *   - CRUD operations push changes to Google Tasks API in real-time
 *   - Bulk sync pulls from Google Tasks into IndependentTasks sheet
 *   - Recurring task support via metadata tags
 */

// ─────────────────────────────────────────────
// 1. LOW-LEVEL REST HELPER
// ─────────────────────────────────────────────

function googleTasksApi_(method, path, payload, queryParams) {
  var base = 'https://tasks.googleapis.com/tasks/v1';
  var query = [];
  var params = queryParams || {};
  Object.keys(params).forEach(function(k) {
    if (params[k] !== null && params[k] !== undefined && params[k] !== '') {
      query.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    }
  });

  var url = base + path + (query.length ? ('?' + query.join('&')) : '');
  var options = {
    method: method.toLowerCase(),
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Type': 'application/json'
    }
  };

  if (payload && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    options.payload = JSON.stringify(payload);
  }

  var resp = UrlFetchApp.fetch(url, options);
  var status = resp.getResponseCode();
  var body = resp.getContentText() || '';

  if (status === 204) return { success: true };

  var parsed;
  try { parsed = JSON.parse(body); } catch (e) { parsed = { raw: body }; }

  if (status < 200 || status >= 300) {
    var message = (parsed && parsed.error && parsed.error.message)
      ? parsed.error.message
      : ('Google Tasks API ' + method + ' failed (' + status + ')');
    throw new Error(message);
  }
  return parsed;
}

// ─────────────────────────────────────────────
// 2. DATE HELPERS
// ─────────────────────────────────────────────

function toGoogleTasksDate_(dateStr) {
  if (!dateStr) return undefined;
  try {
    var s = String(dateStr).trim();
    // Preserve plain date-only values without timezone reinterpretation.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s + "T00:00:00.000Z";
    }
    var d = new Date(s);
    if (isNaN(d.getTime())) return undefined;
    return Utilities.formatDate(d, 'UTC', "yyyy-MM-dd'T'00:00:00.000'Z'");
  } catch (e) { return undefined; }
}

function fromGoogleTasksDate_(dueIso) {
  if (!dueIso) return '';
  try {
    var s = String(dueIso).trim();
    // Google Tasks due values are date-centric; keep the literal date part.
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.substring(0, 10);
    }
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  } catch (e) { return ''; }
}

// ─────────────────────────────────────────────
// 3. TASK LIST OPERATIONS
// ─────────────────────────────────────────────

function listGoogleTaskLists_() {
  var all = [];
  var pageToken = null;
  do {
    var resp = googleTasksApi_('GET', '/users/@me/lists', null, {
      maxResults: 100, pageToken: pageToken
    });
    (resp.items || []).forEach(function(item) {
      all.push({ id: item.id, title: item.title, updated: item.updated || '' });
    });
    pageToken = resp.nextPageToken || null;
  } while (pageToken);
  return all;
}

// ─────────────────────────────────────────────
// 4. SINGLE TASK CRUD → GOOGLE + SHEET
// ─────────────────────────────────────────────

function createTaskAndSync_(taskData, user) {
  var username = String((user && user.username) || '').trim();
  var taskListId = taskData.TaskListId;

  var googlePayload = {
    title: taskData.Title || 'Untitled Task',
    notes: buildGoogleTaskNotes_(taskData),
    status: (taskData.Status === 'Done') ? 'completed' : 'needsAction'
  };
  var dueDate = toGoogleTasksDate_(taskData.Due);
  if (dueDate) googlePayload.due = dueDate;

  var googleTask = null;
  if (taskListId) {
    try {
      googleTask = googleTasksApi_('POST', '/lists/' + encodeURIComponent(taskListId) + '/tasks', googlePayload);
    } catch (e) { Logger.log('Google Tasks create failed: ' + e.message); }
  }

  var localId = googleTask ? ('GTASK-' + googleTask.id) : ('LOCAL-' + Utilities.getUuid());

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
  setCell_(row, idx, 'Tags', buildTags_(taskData));
  setCell_(row, idx, 'Project', taskData.Project || '');
  setCell_(row, idx, 'Recurrence', taskData.Recurrence || '');
  setCell_(row, idx, 'TaskListId', taskListId || '');
  setCell_(row, idx, 'GoogleTaskId', googleTask ? googleTask.id : '');
  setCell_(row, idx, 'Created', new Date().toISOString());
  setCell_(row, idx, 'Updated', new Date().toISOString());

  sheet.appendRow(row);
  clearProjectCache();

  return {
    status: 'success', taskId: localId,
    googleTaskId: googleTask ? googleTask.id : null,
    message: 'Task created' + (googleTask ? ' and synced to Google Tasks.' : '.')
  };
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
    Logger.log('findTaskRow_ failed for "' + localId + '". Sheet has ' + allIds.length + ' rows. IDs: ' + JSON.stringify(allIds.slice(0, 20)));
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

  // Push to Google
  var googleTaskId = getCell_(existingRow, idx, 'GoogleTaskId');
  var taskListId = getCell_(existingRow, idx, 'TaskListId');

  Logger.log('Google push: googleTaskId="' + googleTaskId + '", taskListId="' + taskListId + '"');

  if (googleTaskId && taskListId) {
    try {
      var patch = {
        title: getCell_(existingRow, idx, 'Title'),
        notes: buildGoogleTaskNotes_({
          Description: getCell_(existingRow, idx, 'Description'),
          Priority: getCell_(existingRow, idx, 'Priority'),
          Recurrence: getCell_(existingRow, idx, 'Recurrence')
        }),
        status: (getCell_(existingRow, idx, 'Status') === 'Done') ? 'completed' : 'needsAction'
      };
      var due = toGoogleTasksDate_(getCell_(existingRow, idx, 'Due'));
      if (due) patch.due = due;
      else patch.due = null;
      if (patch.status === 'needsAction') patch.completed = null;
      Logger.log('PATCH payload: ' + JSON.stringify(patch));
      googleTasksApi_('PATCH', '/lists/' + encodeURIComponent(taskListId) + '/tasks/' + encodeURIComponent(googleTaskId), patch);
      Logger.log('Google Tasks PATCH succeeded');
    } catch (e) { Logger.log('Google Tasks update failed: ' + e.message); }
  } else {
    Logger.log('Skipping Google push — missing GoogleTaskId or TaskListId');
  }

  clearProjectCache();
  return { status: 'success', message: 'Task updated.' };
}

function deleteTaskAndSync_(taskId, user) {
  if (!taskId) throw new Error('Task ID is required.');

  var ss = getDataSpreadsheet(user, true);
  var sheet = getSheetOrThrow(ss, INDEPENDENT_TASKS_SHEET);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = buildHeaderIndex_(headers);

  var rowNum = findTaskRow_(sheet, headers, taskId);
  if (!rowNum) throw new Error('Task not found: ' + taskId);

  var existingRow = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  var googleTaskId = getCell_(existingRow, idx, 'GoogleTaskId');
  var taskListId = getCell_(existingRow, idx, 'TaskListId');

  if (googleTaskId && taskListId) {
    try {
      googleTasksApi_('DELETE', '/lists/' + encodeURIComponent(taskListId) + '/tasks/' + encodeURIComponent(googleTaskId));
    } catch (e) { Logger.log('Google Tasks delete failed: ' + e.message); }
  }

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

  // Push to Google
  var googleTaskId = getCell_(existingRow, idx, 'GoogleTaskId');
  var taskListId = getCell_(existingRow, idx, 'TaskListId');
  if (googleTaskId && taskListId) {
    try {
      var patch = { status: (newStatus === 'Done') ? 'completed' : 'needsAction' };
      if (patch.status === 'needsAction') patch.completed = null;
      googleTasksApi_('PATCH', '/lists/' + encodeURIComponent(taskListId) + '/tasks/' + encodeURIComponent(googleTaskId), patch);
    } catch (e) { Logger.log('Google Tasks toggle failed: ' + e.message); }
  }

  // Handle recurrence
  var recurrence = getCell_(existingRow, idx, 'Recurrence');
  if (newStatus === 'Done' && recurrence) {
    spawnNextRecurrence_(existingRow, idx, headers, recurrence, user);
  }

  clearProjectCache();
  return { status: 'success', newStatus: newStatus, message: 'Task marked as ' + newStatus + '.' };
}

// ─────────────────────────────────────────────
// 5. RECURRENCE ENGINE
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

  var nextDueStr = Utilities.formatDate(nextDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  createTaskAndSync_({
    Title: getCell_(completedRow, idx, 'Title'),
    Due: nextDueStr,
    Priority: getCell_(completedRow, idx, 'Priority'),
    Status: 'Open',
    Description: getCell_(completedRow, idx, 'Description'),
    Tags: getCell_(completedRow, idx, 'Tags'),
    Project: getCell_(completedRow, idx, 'Project'),
    Recurrence: recurrence,
    TaskListId: getCell_(completedRow, idx, 'TaskListId')
  }, user);
}

// ─────────────────────────────────────────────
// 6. BULK SYNC FROM GOOGLE → LOCAL
// ─────────────────────────────────────────────

function syncGoogleTasksToIndependent_(taskListId, user) {
  if (!taskListId) throw new Error('Task list ID is required.');

  var username = String((user && user.username) || '').trim();
  var listMeta = googleTasksApi_('GET', '/users/@me/lists/' + encodeURIComponent(taskListId));
  var listTitle = (listMeta && listMeta.title) ? listMeta.title : 'Google Tasks';

  var fetchedTasks = [];
  var pageToken = null;
  do {
    var resp = googleTasksApi_('GET', '/lists/' + encodeURIComponent(taskListId) + '/tasks', null, {
      maxResults: 100, showCompleted: true, showHidden: true, showDeleted: false, showAssigned: true, pageToken: pageToken
    });
    (resp.items || []).forEach(function(t) { fetchedTasks.push(t); });
    pageToken = resp.nextPageToken || null;
  } while (pageToken);

  var ss = getDataSpreadsheet(user, true);
  var sheet = getSheetOrThrow(ss, INDEPENDENT_TASKS_SHEET);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = buildHeaderIndex_(headers);
  ensureColumns_(sheet, headers, idx);
  headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  idx = buildHeaderIndex_(headers);

  var lastRow = sheet.getLastRow();
  var existing = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
  var existingRowById = {};
  existing.forEach(function(row, i) {
    var rowId = String(row[idx['ID']] || '').trim();
    if (rowId) existingRowById[rowId] = i + 2;
  });

  var updates = 0, creates = 0;

  fetchedTasks.forEach(function(gt) {
    if (!gt || !gt.id) return;
    var localId = 'GTASK-' + gt.id;
    var normalizedStatus = String(gt.status || '').toLowerCase() === 'completed' ? 'Done' : 'Open';
    var parsedMeta = parseGoogleTaskNotes_(gt.notes);

    var row = headers.map(function() { return ''; });
    setCell_(row, idx, 'ID', localId);
    setCell_(row, idx, 'Title', gt.title || '(Untitled)');
    setCell_(row, idx, 'Assignee', username);
    setCell_(row, idx, 'Owner', username);
    setCell_(row, idx, 'Status', normalizedStatus);
    setCell_(row, idx, 'Priority', parsedMeta.Priority || 'Medium');
    setCell_(row, idx, 'Due', fromGoogleTasksDate_(gt.due));
    setCell_(row, idx, 'Description', parsedMeta.Description || '');
    setCell_(row, idx, 'Tags', 'google-task, list:' + listTitle);
    setCell_(row, idx, 'Recurrence', parsedMeta.Recurrence || '');
    setCell_(row, idx, 'TaskListId', taskListId);
    setCell_(row, idx, 'GoogleTaskId', gt.id);
    setCell_(row, idx, 'Updated', new Date().toISOString());

    if (existingRowById[localId]) {
      var oldRow = sheet.getRange(existingRowById[localId], 1, 1, headers.length).getValues()[0];
      setCell_(row, idx, 'Created', getCell_(oldRow, idx, 'Created') || new Date().toISOString());
      sheet.getRange(existingRowById[localId], 1, 1, row.length).setValues([row]);
      updates++;
    } else {
      setCell_(row, idx, 'Created', new Date().toISOString());
      sheet.appendRow(row);
      creates++;
    }
  });

  clearProjectCache();
  return {
    status: 'success', synced: fetchedTasks.length, created: creates, updated: updates,
    taskListId: taskListId, taskListTitle: listTitle,
    message: 'Synced ' + fetchedTasks.length + ' Google Tasks from "' + listTitle + '".'
  };
}

function syncAllGoogleTaskLists_(user) {
  var lists = listGoogleTaskLists_();
  if (!lists || !lists.length) return { status: 'success', message: 'No Google Task lists found.', totalSynced: 0 };

  var totalSynced = 0, totalCreated = 0, totalUpdated = 0;
  var listNames = [];
  lists.forEach(function(list) {
    try {
      var result = syncGoogleTasksToIndependent_(list.id, user);
      totalSynced += (result.synced || 0);
      totalCreated += (result.created || 0);
      totalUpdated += (result.updated || 0);
      listNames.push(list.title);
    } catch (e) { Logger.log('Sync failed for list "' + list.title + '": ' + e.message); }
  });

  return {
    status: 'success',
    totalSynced: totalSynced, created: totalCreated, updated: totalUpdated,
    listsProcessed: listNames.length,
    message: 'Synced ' + totalSynced + ' tasks across ' + listNames.length + ' list(s): ' + listNames.join(', ')
  };
}

// ─────────────────────────────────────────────
// 7. GOOGLE TASK NOTES ENCODING
// ─────────────────────────────────────────────

function buildGoogleTaskNotes_(taskData) {
  var parts = [];
  if (taskData.Description) parts.push(taskData.Description);
  var meta = [];
  if (taskData.Priority && taskData.Priority !== 'Medium') meta.push('priority:' + taskData.Priority);
  if (taskData.Recurrence) meta.push('recurrence:' + taskData.Recurrence);
  if (meta.length) parts.push('\n---\n' + meta.join(' | '));
  return parts.join('\n') || '';
}

function parseGoogleTaskNotes_(notes) {
  var result = { Description: '', Priority: 'Medium', Recurrence: '' };
  if (!notes) return result;
  var parts = String(notes).split('\n---\n');
  result.Description = (parts[0] || '').trim();
  if (parts[1]) {
    parts[1].trim().split(/\s*\|\s*/).forEach(function(token) {
      var kv = token.split(':');
      if (kv.length >= 2) {
        var key = kv[0].trim().toLowerCase();
        var val = kv.slice(1).join(':').trim();
        if (key === 'priority') result.Priority = val;
        if (key === 'recurrence') result.Recurrence = val;
      }
    });
  }
  return result;
}

// ─────────────────────────────────────────────
// 8. SHEET UTILITIES
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

function buildTags_(taskData) {
  var tags = [];
  if (taskData.Tags) tags.push(taskData.Tags);
  if (taskData.TaskListId && String(taskData.Tags || '').indexOf('google-task') === -1) tags.push('google-task');
  return tags.join(', ');
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
