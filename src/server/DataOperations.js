/**
 * @file DataOperations.js
 * @description Data persistence operations for configuration, manual data, and independent tasks.
 * 
 * This module handles:
 * - Saving configuration options to sheets
 * - Managing manual data overrides
 * - Saving and updating independent tasks
 * - Updating last checked timestamps
 * 
 * Dependencies:
 * - Constants.js (sheet names)
 * - SheetOperations.js (getSheetOrThrow)
 * - CacheManager.js (clearProjectCache, logTimestampOperation)
 */

/**
 * Save configuration options to the config sheet
 * @param {Object} optionsData - Configuration data to save
 * @returns {Object} Result object with status and message
 */
function saveConfiguration_(optionsData) {
  var lock = Platform.lock();
  try {
    lock.waitLock(30000); // Wait up to 30 seconds
  } catch (e) {
    return { status: 'error', message: 'Server is busy. Please try again.' };
  }

  try {
    // Config is Global
    var ss = getGlobalSpreadsheet();
    var sheet = getSheetOrThrow(ss, CONFIG_SHEET);
    
    // Set headers (extend with per-type options; mappings are lists in H/I)
    sheet.getRange("A1:M1").setValues([[
      "ACT/PCT Options", 
      "Planning Stage Options", 
      "Project Stage Options", 
      "HelpfulLinks",
      "Epic Project Stage Options",
      "Story Project Stage Options",
      "Bug Project Stage Options",
      "Closed Project Stages",
      "Closed Status Keywords",
      "Stage→Status (JSON)",
      "Stage→Status Keywords",
      "Past Sprint Closed Project Stages",
      "Priority Options"
    ]]);
    
    // Set header for Past Due Exempt Stages in O1 (Column 15) and KPI Project Stages in P1 (Column 16)
    sheet.getRange("O1").setValue("Past Due Exempt Stages");
    sheet.getRange("P1").setValue("KPI Project Stages");
    sheet.getRange("Q1").setValue("Independent Task Status Options");
    sheet.getRange("R1").setValue("Not In Progress Statuses");
    
    // Clear existing data (A-M, O, P, Q, R, skipping N which is Connectors)
    sheet.getRange("A2:M" + sheet.getMaxRows()).clearContent();
    sheet.getRange("O2:R" + sheet.getMaxRows()).clearContent();
    
    // Prepare data
    var actData = optionsData.actPctOptions.map(function(o) { return [o]; });
    var planData = optionsData.planningStageOptions.map(function(o) { return [o]; });
    var projData = optionsData.projectStageOptions.map(function(o) { return [o]; });
    var kpiProjData = (optionsData.kpiProjectStages || []).map(function(o) { return [o]; });
    var epicProjData = (optionsData.epicProjectStageOptions || []).map(function(o) { return [o]; });
    var storyProjData = (optionsData.storyProjectStageOptions || []).map(function(o) { return [o]; });
    var bugProjData = (optionsData.bugProjectStageOptions || []).map(function(o) { return [o]; });
    var priorityData = (optionsData.priorityOptions || []).map(function(o) { return [o]; });
    var pastDueExemptData = (optionsData.pastDueExemptStages || []).map(function(o) { return [o]; });
    var independentTaskStatusData = (optionsData.independentTaskStatusOptions || []).map(function(o) { return [o]; });
    var inProgressData = (optionsData.notInProgressStatuses || optionsData.inProgressStatuses || []).map(function(o) { return [o]; });
    
    // Set option data
    if (actData.length > 0) sheet.getRange(2, 1, actData.length, 1).setValues(actData);
    if (planData.length > 0) sheet.getRange(2, 2, planData.length, 1).setValues(planData);
    if (projData.length > 0) sheet.getRange(2, 3, projData.length, 1).setValues(projData);
    
    // Set KPI Project Stages in P (column 16)
    if (kpiProjData.length > 0) sheet.getRange(2, 16, kpiProjData.length, 1).setValues(kpiProjData);

    // Set Independent Task Status Options in Q (column 17)
    if (independentTaskStatusData.length > 0) sheet.getRange(2, 17, independentTaskStatusData.length, 1).setValues(independentTaskStatusData);

    // Set Not In Progress Statuses in R (column 18)
    if (inProgressData.length > 0) sheet.getRange(2, 18, inProgressData.length, 1).setValues(inProgressData);
    
    // Set per-type options in E, F, G (restored original positions)
    if (epicProjData.length > 0) sheet.getRange(2, 5, epicProjData.length, 1).setValues(epicProjData);
    if (storyProjData.length > 0) sheet.getRange(2, 6, storyProjData.length, 1).setValues(storyProjData);
    if (bugProjData.length > 0) sheet.getRange(2, 7, bugProjData.length, 1).setValues(bugProjData);
    
    // Set priority options in M (column 13)
    if (priorityData.length > 0) sheet.getRange(2, 13, priorityData.length, 1).setValues(priorityData);

    // Set Past Due Exempt Stages in O (column 15)
    if (pastDueExemptData.length > 0) sheet.getRange(2, 15, pastDueExemptData.length, 1).setValues(pastDueExemptData);
    
    // Set Helpful Links in D (column 4) - write as individual JSON objects per row
    var helpfulLinksData = (optionsData.helpfulLinks || []).map(function(link) {
      return [JSON.stringify(link)];
    });
    if (helpfulLinksData.length > 0) {
      sheet.getRange(2, 4, helpfulLinksData.length, 1).setValues(helpfulLinksData);
    }
    
    // Write mappings as multi-row lists (H and I) - restored original positions
    var closedStagesData = (optionsData.closedProjectStages || []).map(function(o) { return [o]; });
    var closedStatusesData = (optionsData.closedStatuses || []).map(function(o) { return [o]; });
    if (closedStagesData.length > 0) sheet.getRange(2, 8, closedStagesData.length, 1).setValues(closedStagesData);
    if (closedStatusesData.length > 0) sheet.getRange(2, 9, closedStatusesData.length, 1).setValues(closedStatusesData);
    
    // Write Past Sprint Closed Project Stages (L) - restored original position
    var pastSprintClosedData = (optionsData.pastSprintClosedStages || []).map(function(o){ return [o]; });
    if (pastSprintClosedData.length > 0) sheet.getRange(2, 12, pastSprintClosedData.length, 1).setValues(pastSprintClosedData);

    // Write Stage↔Status mappings: store JSON copy in J2 for convenience and pairs starting at row 2 in J/K - restored original positions
    var stageStatus = Array.isArray(optionsData.stageStatusMappings) ? optionsData.stageStatusMappings : [];
    sheet.getRange("J2").setValue(JSON.stringify(stageStatus));
    if (stageStatus.length > 0) {
      var pairRows = stageStatus.map(function(m){ return [m.stage || '', (m.expectedStatuses || []).join(', ')]; });
      sheet.getRange(2, 10, pairRows.length, 2).setValues(pairRows);
    }
    
    clearConfigCache();
    clearProjectCache();
    return { status: 'success', message: 'Configuration saved!' };
  } catch (e) {
    return { status: 'error', message: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Save developer capacity settings to the DeveloperCapacity sheet
 * @param {Array<{developer: string, capacity: number|string, notes: string}>} entries
 * @returns {Object} Result object with status and message
 */
function saveDeveloperCapacity_(entries, settings) {
  var lock = Platform.lock();
  try {
    lock.waitLock(30000); // Wait up to 30 seconds
  } catch (e) {
    return { status: 'error', message: 'Server is busy. Please try again.' };
  }

  try {
    if (!Array.isArray(entries)) throw new Error('Developer capacity data is invalid.');
    var normalizedSettings = settings !== undefined ? normalizeDeveloperCapacitySettings_(settings) : null;
    var ss = getGlobalSpreadsheet();
    var sheet = ss.getSheetByName(DEVELOPER_CAPACITY_SHEET);
    var existing = sheet ? readDeveloperCapacity(sheet) : [];
    var existingByName = new Map(existing.map(function(entry) {
      return [entry.developer.toLowerCase(), entry];
    }));
    var seen = new Set();
    var timestamp = Platform.formatDate(new Date(), Platform.timeZone(), 'MM/dd/yyyy HH:mm:ss');
    var updates = entries.map(function(entry) {
      if (!entry || typeof entry.developer !== 'string' || !entry.developer.trim()) {
        throw new Error('Developer name is required.');
      }
      var developer = entry.developer.trim();
      var key = developer.toLowerCase();
      if (seen.has(key)) throw new Error('Developer names must be unique.');
      seen.add(key);
      var raw = entry.capacity;
      if (raw !== null && typeof raw !== 'string' && typeof raw !== 'number') {
        throw new Error('Capacity must be a non-negative number or blank.');
      }
      var text = raw === null ? '' : String(raw).trim();
      var capacity = text === '' ? null : Number(text);
      if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) {
        throw new Error('Capacity must be a non-negative number or blank.');
      }
      var manager = entry.manager == null ? '' : String(entry.manager).trim();
      var hasSprintOverrides = Object.prototype.hasOwnProperty.call(entry, 'sprintOverrides');
      var sprintOverrides = hasSprintOverrides ? normalizeDeveloperSprintOverrides_(entry.sprintOverrides) : null;
      return {
        developer: developer,
        capacity: capacity,
        manager: manager,
        hasManager: Object.prototype.hasOwnProperty.call(entry, 'manager'),
        hasSprintOverrides: hasSprintOverrides,
        sprintOverrides: sprintOverrides,
        key: key
      };
    });

    var schemaHeaders = trackerSheetSchema()[DEVELOPER_CAPACITY_SHEET];
    if (!sheet) {
      sheet = ss.insertSheet(DEVELOPER_CAPACITY_SHEET);
      sheet.getRange(1, 1, 1, schemaHeaders.length).setValues([schemaHeaders]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastColumn() < schemaHeaders.length) {
      sheet.getRange(1, 1, 1, schemaHeaders.length).setValues([schemaHeaders]).setFontWeight('bold');
    }
    var data = sheet.getDataRange().getValues();
    var rowByName = new Map();
    data.slice(1).forEach(function(row, index) {
      var name = String(row[0] == null ? '' : row[0]).trim();
      if (name) rowByName.set(name.toLowerCase(), index + 2);
    });
    updates.forEach(function(update) {
      var row = rowByName.get(update.key);
      var old = existingByName.get(update.key);
      var managerValue = update.hasManager ? update.manager : (old && old.manager ? old.manager : '');
      var overridesObj = update.hasSprintOverrides ? update.sprintOverrides : (old && old.sprintOverrides ? old.sprintOverrides : {});
      var overridesValue = overridesObj && Object.keys(overridesObj).length > 0 ? JSON.stringify(overridesObj) : '';
      var values = [update.developer, update.capacity === null ? '' : update.capacity, old ? old.notes : '', timestamp, managerValue, overridesValue];
      if (row) sheet.getRange(row, 1, 1, schemaHeaders.length).setValues([values]);
      else sheet.appendRow(values);
    });

    if (normalizedSettings) {
      var adminHeaders = trackerSheetSchema()[ADMIN_CONFIGS_SHEET];
      var adminSheet = ss.getSheetByName(ADMIN_CONFIGS_SHEET);
      if (!adminSheet) {
        adminSheet = ss.insertSheet(ADMIN_CONFIGS_SHEET);
        adminSheet.getRange(1, 1, 1, adminHeaders.length).setValues([adminHeaders]).setFontWeight('bold');
        adminSheet.setFrozenRows(1);
      }
      var adminData = adminSheet.getDataRange().getValues();
      var settingsRow = -1;
      for (var i = 1; i < adminData.length; i++) {
        if (String(adminData[i][0] == null ? '' : adminData[i][0]).trim() === '__CAPACITY_SETTINGS__') {
          settingsRow = i + 1;
          break;
        }
      }
      var settingsValues = ['__CAPACITY_SETTINGS__', JSON.stringify(normalizedSettings), timestamp];
      if (settingsRow !== -1) {
        adminSheet.getRange(settingsRow, 1, 1, adminHeaders.length).setValues([settingsValues]);
      } else {
        adminSheet.appendRow(settingsValues);
      }
    }

    clearProjectCache();
    return { status: 'success', message: 'Developer capacity saved!' };
  } catch (e) {
    return { status: 'error', message: 'Failed to save developer capacity: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

function listWorkbookUsers_() {
  return getUsers().map(function(user) {
    return {
      id: user.id,
      username: user.username || '',
      email: user.email || '',
      displayName: user.displayName || '',
      role: user.role || 'user',
      isActive: user.isActive === true,
      microsoftObjectId: user.microsoftObjectId || ''
    };
  });
}

function saveWorkbookUsers_(entries, currentUser) {
  var lock = Platform.lock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return { status: 'error', message: 'Server is busy. Please try again.' };
  }

  try {
    if (!currentUser || String(currentUser.role || '').toLowerCase() !== 'admin') {
      throw new Error('Admin rights are required to manage users.');
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('At least one user is required.');
    }

    var sheet = getSheetOrThrow(getGlobalSpreadsheet(), USERS_SHEET);
    var values = sheet.getDataRange().getValues();
    var headers = values[0].map(function(header) { return String(header || '').trim(); });
    var columns = {};
    ['ID', 'Username', 'Email', 'Display Name', 'Role', 'Is Active', 'Password', 'Created At', 'Microsoft Object ID'].forEach(function(header) {
      columns[header] = headers.indexOf(header);
    });
    if (Object.keys(columns).some(function(header) { return columns[header] === -1; })) {
      throw new Error('Users worksheet headers are invalid.');
    }

    var existingById = new Map();
    values.slice(1).forEach(function(row, index) {
      var id = String(row[columns.ID] == null ? '' : row[columns.ID]).trim();
      if (!id) return;
      if (existingById.has(id)) throw new Error('Users worksheet contains duplicate IDs.');
      existingById.set(id, {
        id: id,
        rowNumber: index + 2,
        username: String(row[columns.Username] == null ? '' : row[columns.Username]).trim(),
        email: String(row[columns.Email] == null ? '' : row[columns.Email]).trim(),
        displayName: String(row[columns['Display Name']] == null ? '' : row[columns['Display Name']]).trim(),
        role: String(row[columns.Role] == null ? '' : row[columns.Role]).trim().toLowerCase().replace(/\s+/g, '_'),
        isActive: isActiveUser_(row[columns['Is Active']]),
        microsoftObjectId: String(row[columns['Microsoft Object ID']] == null ? '' : row[columns['Microsoft Object ID']]).trim()
      });
    });

    var nextUsers = new Map(existingById);
    var updates = [];
    var submittedIds = new Set();
    entries.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') throw new Error('User data is invalid.');
      var id = String(entry.id == null ? '' : entry.id).trim();
      var existing = id ? existingById.get(id) : null;
      if (id && !existing) throw new Error('A user was changed or removed while you were editing. Reload the Users tab and try again.');
      if (id && submittedIds.has(id)) throw new Error('Users contain duplicate IDs.');

      var username = String(entry.username == null ? '' : entry.username).trim();
      var email = String(entry.email == null ? '' : entry.email).trim();
      var displayName = String(entry.displayName == null ? '' : entry.displayName).trim() || username;
      var role = String(entry.role == null ? '' : entry.role).trim().toLowerCase().replace(/\s+/g, '_');
      var microsoftObjectId = String(entry.microsoftObjectId == null ? '' : entry.microsoftObjectId).trim();
      if (!username || username.length > 128) throw new Error('Enter a username up to 128 characters.');
      if ((!existing && !email) || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        throw new Error('Enter a valid email address up to 254 characters.');
      }
      if (!displayName || displayName.length > 128) throw new Error('Enter a display name up to 128 characters.');
      if (!role || role.length > 64 || !/^[a-z][a-z0-9_-]*$/.test(role)) throw new Error('Choose a valid user role.');
      if (microsoftObjectId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(microsoftObjectId)) {
        throw new Error('Enter a valid Microsoft Object ID.');
      }
      if (!existing && !microsoftObjectId) throw new Error('New users need a Microsoft Object ID.');
      if (typeof entry.isActive !== 'boolean') throw new Error('User active status is invalid.');

      if (!id) {
        do {
          id = generateId();
        } while (existingById.has(id) || nextUsers.has(id));
      }
      submittedIds.add(id);
      var updated = {
        id: id,
        username: username,
        email: email,
        displayName: displayName,
        role: role,
        isActive: entry.isActive,
        microsoftObjectId: microsoftObjectId
      };
      nextUsers.set(id, updated);
      updates.push({ existing: existing, user: updated });
    });

    var seenUsernames = new Set();
    var seenEmails = new Set();
    var seenObjectIds = new Set();
    var activeAdminCount = 0;
    nextUsers.forEach(function(user) {
      var usernameKey = user.username.toLowerCase();
      var emailKey = user.email.toLowerCase();
      var objectIdKey = user.microsoftObjectId.toLowerCase();
      if (usernameKey && seenUsernames.has(usernameKey)) throw new Error('Usernames must be unique.');
      if (emailKey && seenEmails.has(emailKey)) throw new Error('Email addresses must be unique.');
      if (objectIdKey && seenObjectIds.has(objectIdKey)) throw new Error('Microsoft Object IDs must be unique.');
      if (usernameKey) seenUsernames.add(usernameKey);
      if (emailKey) seenEmails.add(emailKey);
      if (objectIdKey) seenObjectIds.add(objectIdKey);
      if (user.isActive && user.role === 'admin') activeAdminCount++;
    });
    if (!activeAdminCount) throw new Error('At least one active admin must remain.');
    var signedInAdmin = nextUsers.get(String(currentUser.id));
    if (!signedInAdmin || !signedInAdmin.isActive || signedInAdmin.role !== 'admin') {
      throw new Error('You cannot deactivate or demote your own admin account. Use another active admin account.');
    }

    updates.forEach(function(update) {
      var user = update.user;
      if (update.existing) {
        var oldUsername = update.existing.username;
        sheet.getRange(update.existing.rowNumber, columns.Username + 1).setValue(user.username);
        if (oldUsername !== user.username && typeof updateDataOwnership === 'function') {
          updateDataOwnership(oldUsername, user.username);
        }
        sheet.getRange(update.existing.rowNumber, columns.Email + 1).setValue(user.email);
        sheet.getRange(update.existing.rowNumber, columns['Display Name'] + 1).setValue(user.displayName);
        sheet.getRange(update.existing.rowNumber, columns.Role + 1).setValue(user.role);
        sheet.getRange(update.existing.rowNumber, columns['Is Active'] + 1).setValue(user.isActive);
        sheet.getRange(update.existing.rowNumber, columns['Microsoft Object ID'] + 1).setValue(user.microsoftObjectId);
      } else {
        var newRow = Array(headers.length).fill('');
        newRow[columns.ID] = user.id;
        newRow[columns.Username] = user.username;
        newRow[columns.Email] = user.email;
        newRow[columns['Display Name']] = user.displayName;
        newRow[columns.Role] = user.role;
        newRow[columns['Is Active']] = user.isActive;
        newRow[columns.Password] = '';
        if (columns['Created At'] > -1) newRow[columns['Created At']] = new Date();
        newRow[columns['Microsoft Object ID']] = user.microsoftObjectId;
        sheet.appendRow(newRow);
      }
    });

    clearUsersCache();
    clearProjectCache();
    return { status: 'success', message: 'Users saved.' };
  } catch (e) {
    return { status: 'error', message: 'Failed to save users: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Save manual data override for a specific Jira item
 * @param {string} jiraId - The Jira ID
 * @param {string} field - The field name to update
 * @param {*} value - The value to save
 * @param {Object} user - The user context
 * @returns {Object} Result object with status and message
 */
function saveManualData_(jiraId, field, value, user) {
  var lock = Platform.lock();
  try {
    lock.waitLock(30000); // Wait up to 30 seconds
  } catch (e) {
    return { status: 'error', message: 'Server is busy. Please try again.' };
  }

  try {
    // Manual Data is User-Specific
    var ss = getDataSpreadsheet(user, true);
    var sheet = getSheetOrThrow(ss, MANUAL_DATA_SHEET);
    var data = sheet.getDataRange().getValues();
    var rowToUpdate = -1;
    
    // Find existing row for this Jira ID
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] == jiraId) {
        rowToUpdate = i + 1;
        break;
      }
    }
    
    // Map field names to column indices
    var colToUpdate;
    if (field === 'ACT/PCT') colToUpdate = 2;
    else if (field === 'Planning Stage') colToUpdate = 3;
    else if (field === 'Project Stage') colToUpdate = 4;
    else if (field === 'Start Date') colToUpdate = 6;
    else if (field === 'End Date') colToUpdate = 7;
    else if (field === 'Drive Link') colToUpdate = 8;
    else if (field === 'Priority') colToUpdate = 9;
    else if (field === 'Artifacts') colToUpdate = 10;

    // Auto-add Artifacts header if missing
    if (field === 'Artifacts') {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (headers.indexOf('Artifacts') === -1) {
        sheet.getRange(1, 10).setValue('Artifacts');
      }
    }
    
    if (rowToUpdate > 0 && colToUpdate) {
      // Update existing row
      sheet.getRange(rowToUpdate, colToUpdate).setValue(value || null);
    } else if (colToUpdate) { 
      // Create new row
      var newRow = [jiraId, '', '', '', null, null, null, '', '', ''];
      newRow[0] = jiraId;
      newRow[colToUpdate - 1] = value || null;
      sheet.appendRow(newRow);
    }
    
    clearProjectCache();
    return { status: 'success', message: 'Data saved!' };
  } catch (e) {
    return { status: 'error', message: 'Failed to save data: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update Drive Link for a specific Jira item
 * @param {string} jiraId - The Jira ID
 * @param {string} driveLink - The Drive Link URL
 * @returns {Object} Result object with success status
 */
function updateDriveLink_(jiraId, driveLink, user) {
  try {
    var result = saveManualData_(jiraId, 'Drive Link', driveLink, user);
    if (result.status === 'success') {
      return { success: true, message: 'Drive Link updated successfully' };
    } else {
      return { success: false, error: result.message };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Save or update an independent task
 * @param {Object} taskData - Task data to save
 * @param {Object} user - The user performing the save
 * @returns {Object} Result object with status and message
 */
function saveIndependentTask_(taskData, user) {
  var lock = Platform.lock();
  try {
    lock.waitLock(30000); // Wait up to 30 seconds
  } catch (e) {
    return { status: 'error', message: 'Server is busy. Please try again.' };
  }

  try {
    // Independent Tasks are User-Specific
    var ss = getDataSpreadsheet(user, true);
    var sheet = getSheetOrThrow(ss, INDEPENDENT_TASKS_SHEET);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // If new task, set Owner
    if (!taskData.ID && user) {
      // Use fresh username if available via UserID
      if (user.id) {
          var freshUser = getUserById(user.id);
          if (freshUser) {
              taskData.Owner = freshUser.username;
          } else {
              taskData.Owner = user.username;
          }
      } else {
          taskData.Owner = user.username;
      }
    }
    
    var newRow = headers.map(function(header) { 
      return taskData[header] || ''; 
    });
    
    if (taskData.ID) {
      // Update existing task
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
      var rowIndex = -1;
      
      for (var i = 0; i < data.length; i++) {
        if (data[i][idIndex] == taskData.ID) {
          rowIndex = i + 2;
          // Preserve existing Owner if not provided in update
          var ownerIndex = headers.indexOf('Owner');
          if (ownerIndex > -1 && !taskData.Owner) {
             newRow[ownerIndex] = data[i][ownerIndex];
          }
          break;
        }
      }
      
      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
      } else {
        // ID provided but not found? Treat as new? Or error?
        // For now, append as new if ID not found is safer to avoid data loss
        sheet.appendRow(newRow);
      }
    } else {
      // Create new task
      var idIndex = headers.indexOf('ID');
      if (idIndex > -1) {
         // Generate ID if not present
         var newId = 'TASK-' + new Date().getTime();
         newRow[idIndex] = newId;
      }
      sheet.appendRow(newRow);
    }
    
    clearProjectCache();
    return { status: 'success', message: 'Task saved successfully!' };
  } catch (e) {
    return { status: 'error', message: 'Failed to save task: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update the "Last Checked" timestamp for a Jira item
 * @param {string} jiraId - The Jira ID to update
 * @param {Object} user - The user context
 * @returns {Object} Result object with status, message, and new timestamp
 */
function updateLastChecked_(jiraId, user) {
  var lock = Platform.lock();
  try {
    lock.waitLock(30000); // Wait up to 30 seconds
  } catch (e) {
    return { status: 'error', message: 'Server is busy. Please try again.' };
  }

  try {
    // Manual Data (Last Checked) is User-Specific
    var ss = getDataSpreadsheet(user, true);
    var sheet = getSheetOrThrow(ss, MANUAL_DATA_SHEET);
    var data = sheet.getDataRange().getValues();
    var rowToUpdate = -1;
    
    // Find existing row for this Jira ID
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] == jiraId) {
        rowToUpdate = i + 1;
        break;
      }
    }
    
    // Format current time in script timezone for display consistency
    var now = new Date();
    var tz = Platform.timeZone();
    var formattedTimestamp = Platform.formatDate(now, tz, 'MM/dd/yyyy HH:mm:ss');
    
    if (rowToUpdate > 0) {
      // Update existing row
      var cell = sheet.getRange(rowToUpdate, 5); // Last Checked column
      cell.setValue(formattedTimestamp);
      cell.setNumberFormat("@"); // Force text format to prevent auto-conversion
    } else {
      // Create new row
      sheet.appendRow([jiraId, '', '', '', formattedTimestamp, null, null, '']);
      // Set text format for the new timestamp cell
      if (sheet.getLastRow() > 1) {
        var cell = sheet.getRange(sheet.getLastRow(), 5);
        cell.setNumberFormat("@"); // Force text format
      }
    }
    
    clearProjectCache(user ? user.username : null);
    
    // Return the formatted timestamp so the UI can display it directly
    return { 
      status: 'success', 
      message: 'Timestamp updated!', 
      newTimestamp: formattedTimestamp 
    };
  } catch (e) {
    return { status: 'error', message: 'Failed to update timestamp: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}
