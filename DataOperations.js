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
  var lock = LockService.getScriptLock();
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
    sheet.getRange("R1").setValue("In Progress Statuses");
    
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
    var inProgressData = (optionsData.inProgressStatuses || []).map(function(o) { return [o]; });
    
    // Set option data
    if (actData.length > 0) sheet.getRange(2, 1, actData.length, 1).setValues(actData);
    if (planData.length > 0) sheet.getRange(2, 2, planData.length, 1).setValues(planData);
    if (projData.length > 0) sheet.getRange(2, 3, projData.length, 1).setValues(projData);
    
    // Set KPI Project Stages in P (column 16)
    if (kpiProjData.length > 0) sheet.getRange(2, 16, kpiProjData.length, 1).setValues(kpiProjData);

    // Set Independent Task Status Options in Q (column 17)
    if (independentTaskStatusData.length > 0) sheet.getRange(2, 17, independentTaskStatusData.length, 1).setValues(independentTaskStatusData);

    // Set In Progress Statuses in R (column 18)
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
 * Save manual data override for a specific Jira item
 * @param {string} jiraId - The Jira ID
 * @param {string} field - The field name to update
 * @param {*} value - The value to save
 * @param {Object} user - The user context
 * @returns {Object} Result object with status and message
 */
function saveManualData_(jiraId, field, value, user) {
  var lock = LockService.getScriptLock();
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
    
    if (rowToUpdate > 0 && colToUpdate) {
      // Update existing row
      sheet.getRange(rowToUpdate, colToUpdate).setValue(value || null);
    } else if (colToUpdate) { 
      // Create new row
      var newRow = [jiraId, '', '', '', null, null, null, '', ''];
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
  var lock = LockService.getScriptLock();
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
  var lock = LockService.getScriptLock();
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
    var tz = Session.getScriptTimeZone();
    var formattedTimestamp = Utilities.formatDate(now, tz, 'MM/dd/yyyy HH:mm:ss');
    
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
