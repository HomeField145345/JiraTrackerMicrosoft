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
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
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
    
    // Clear existing data
    sheet.getRange("A2:M" + sheet.getMaxRows()).clearContent();
    
    // Prepare data
    var actData = optionsData.actPctOptions.map(function(o) { return [o]; });
    var planData = optionsData.planningStageOptions.map(function(o) { return [o]; });
    var projData = optionsData.projectStageOptions.map(function(o) { return [o]; });
    var epicProjData = (optionsData.epicProjectStageOptions || []).map(function(o) { return [o]; });
    var storyProjData = (optionsData.storyProjectStageOptions || []).map(function(o) { return [o]; });
    var bugProjData = (optionsData.bugProjectStageOptions || []).map(function(o) { return [o]; });
    var priorityData = (optionsData.priorityOptions || []).map(function(o) { return [o]; });
    
    // Set option data
    if (actData.length > 0) sheet.getRange(2, 1, actData.length, 1).setValues(actData);
    if (planData.length > 0) sheet.getRange(2, 2, planData.length, 1).setValues(planData);
    if (projData.length > 0) sheet.getRange(2, 3, projData.length, 1).setValues(projData);
    
    // Set per-type options in E, F, G (restored original positions)
    if (epicProjData.length > 0) sheet.getRange(2, 5, epicProjData.length, 1).setValues(epicProjData);
    if (storyProjData.length > 0) sheet.getRange(2, 6, storyProjData.length, 1).setValues(storyProjData);
    if (bugProjData.length > 0) sheet.getRange(2, 7, bugProjData.length, 1).setValues(bugProjData);
    
    // Set priority options in M (column 13)
    if (priorityData.length > 0) sheet.getRange(2, 13, priorityData.length, 1).setValues(priorityData);
    
    // Set Helpful Links JSON blob
    sheet.getRange("D2").setValue(JSON.stringify(optionsData.helpfulLinks || []));
    
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
    
    clearProjectCache();
    return { status: 'success', message: 'Configuration saved!' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/**
 * Save manual data override for a specific Jira item
 * @param {string} jiraId - The Jira ID
 * @param {string} field - The field name to update
 * @param {*} value - The value to save
 * @returns {Object} Result object with status and message
 */
function saveManualData_(jiraId, field, value) {
  try {
    var sheet = getSheetOrThrow(SpreadsheetApp.getActiveSpreadsheet(), MANUAL_DATA_SHEET);
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
    
    // Log any date field updates
    if (field === 'Start Date' || field === 'End Date') {
      // Get previous value if it exists
      var previousValue = null;
      if (rowToUpdate > 0) {
        previousValue = data[rowToUpdate-1][colToUpdate-1];
      }
      
      logTimestampOperation("Manual Date Field Update", {
        jiraId: jiraId,
        field: field,
        previousValue: previousValue ? (previousValue instanceof Date ? previousValue.toISOString() : String(previousValue)) : null,
        newValue: value,
        dateType: typeof value,
        action: rowToUpdate > 0 ? "update_existing" : "create_new_row"
      });
    }

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
  }
}

/**
 * Update Drive Link for a specific Jira item
 * @param {string} jiraId - The Jira ID
 * @param {string} driveLink - The Drive Link URL
 * @returns {Object} Result object with success status
 */
function updateDriveLink_(jiraId, driveLink) {
  try {
    var result = saveManualData_(jiraId, 'Drive Link', driveLink);
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
  try {
    var sheet = getSheetOrThrow(SpreadsheetApp.getActiveSpreadsheet(), INDEPENDENT_TASKS_SHEET);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // If new task, set Owner
    if (!taskData.ID && user) {
      taskData.Owner = user.username;
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
  }
}

/**
 * Update the "Last Checked" timestamp for a Jira item
 * @param {string} jiraId - The Jira ID to update
 * @returns {Object} Result object with status, message, and new timestamp
 */
function updateLastChecked_(jiraId) {
  try {
    var sheet = getSheetOrThrow(SpreadsheetApp.getActiveSpreadsheet(), MANUAL_DATA_SHEET);
    var data = sheet.getDataRange().getValues();
    var rowToUpdate = -1;
    
    // Find existing row for this Jira ID
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] == jiraId) {
        rowToUpdate = i + 1;
        break;
      }
    }
    
    var timestamp = new Date();
    
    // Log the timestamp we're about to save
    logTimestampOperation("Update Last Checked", {
      jiraId: jiraId,
      timestamp: timestamp.toString(),
      timestampIso: timestamp.toISOString(),
      action: rowToUpdate > 0 ? "update_existing_row" : "append_new_row"
    });
    
    if (rowToUpdate > 0) {
      // Update existing row
      var cell = sheet.getRange(rowToUpdate, 5); // Last Checked column
      cell.setValue(timestamp);
      cell.setNote("UTC timestamp set by system on " + new Date().toISOString());
    } else {
      // Create new row
      sheet.appendRow([jiraId, '', '', '', timestamp, null, null, '']);
      // Add note to the new timestamp cell
      if (sheet.getLastRow() > 1) {
        sheet.getRange(sheet.getLastRow(), 5).setNote("UTC timestamp set by system on " + new Date().toISOString());
      }
    }
    
    clearProjectCache();
    
    // Return the new timestamp so the UI can update seamlessly
    return { 
      status: 'success', 
      message: 'Timestamp updated!', 
      newTimestamp: timestamp.toISOString() 
    };
  } catch (e) {
    return { status: 'error', message: 'Failed to update timestamp: ' + e.message };
  }
}
