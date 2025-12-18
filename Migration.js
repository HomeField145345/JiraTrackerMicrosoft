/**
 * @file Migration.js
 * @description Handles migration of users from Global Database to Personal Database.
 */

/**
 * Migrates a user from the Global Database to a new Personal Database.
 * 
 * @param {string} token - Admin authentication token.
 * @param {string} targetUserId - The ID of the user to migrate.
 * @returns {Object} Result object { success: boolean, message: string, newSheetUrl: string }.
 */
function migrateUserToPersonalDatabase(token, targetUserId) {
  // 1. Authenticate Admin
  const session = validateSession(token);
  if (!session.valid || (session.role !== 'admin' && session.role !== 'project_manager')) {
    return { success: false, message: 'Unauthorized: Only Admins can perform migrations.' };
  }

  // 2. Get Target User
  const users = getUsers();
  const targetUserIndex = users.findIndex(u => u.id === targetUserId);
  if (targetUserIndex === -1) {
    return { success: false, message: 'User not found.' };
  }
  const targetUser = users[targetUserIndex];

  // 3. Check if already migrated
  if (targetUser.dataSheetId && targetUser.dataSheetId.trim() !== '') {
    return { success: false, message: 'User already has a Data Sheet assigned.' };
  }

  try {
    // 4. Create New Spreadsheet
    const newSS = SpreadsheetApp.create("Jira Tracker Data - " + targetUser.username);
    const newSSId = newSS.getId();
    const newSSUrl = newSS.getUrl();

    // 5. Setup Structure (Sheets & Headers)
    setupSheets(newSS);

    // 5b. Remove unnecessary sheets (Config, Users, Sessions, Admin)
    // The user data sheet only needs JiraData, ManualData, and IndependentTasks
    const sheetsToRemove = [CONFIG_SHEET, USERS_SHEET, SESSIONS_SHEET, ADMIN_CONFIGS_SHEET];
    sheetsToRemove.forEach(sheetName => {
      const sheet = newSS.getSheetByName(sheetName);
      if (sheet) newSS.deleteSheet(sheet);
    });

    // 6. Copy Filtered Data from Global to New Sheet
    const globalSS = getGlobalSpreadsheet();
    const username = targetUser.username;
    
    // Filter and Copy JiraData
    const jiraKeys = copyFilteredJiraData_(globalSS, newSS, username);
    
    // Filter and Copy ManualData (matching Jira Keys)
    copyFilteredManualData_(globalSS, newSS, jiraKeys);
    
    // Filter and Copy IndependentTasks
    copyFilteredIndependentTasks_(globalSS, newSS, username);

    // 7. Update User Record
    // updateUser expects (userId, updatesObject)
    updateUser(targetUser.id, { dataSheetId: newSSId }); 

    return { 
      success: true, 
      message: 'Migration successful. New Data Sheet created.', 
      newSheetUrl: newSSUrl,
      newSheetId: newSSId
    };

  } catch (e) {
    Logger.log("Migration Error: " + e.toString());
    return { success: false, message: 'Migration failed: ' + e.message };
  }
}

/**
 * Copies JiraData rows where Assignee or Owner matches the username.
 * Returns a Set of Jira Keys for filtering ManualData.
 */
function copyFilteredJiraData_(sourceSS, targetSS, username) {
  const sourceSheet = sourceSS.getSheetByName(JIRA_DATA_SHEET);
  const targetSheet = targetSS.getSheetByName(JIRA_DATA_SHEET);
  const keys = new Set();

  if (!sourceSheet || !targetSheet || sourceSheet.getLastRow() <= 1) return keys;

  const data = sourceSheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  // Indices: Jira # (1), Assignee (5), Owner (17)
  // Note: These indices must match setupSheets definition. 
  // If columns move, this needs update.
  // Let's dynamically find them to be safe.
  const assigneeIdx = headers.indexOf('Assignee');
  const ownerIdx = headers.indexOf('Owner');
  const keyIdx = headers.indexOf('Jira #');

  if (assigneeIdx === -1 || keyIdx === -1) return keys; // Critical columns missing

  const filteredRows = rows.filter(row => {
    const assignee = String(row[assigneeIdx]).toLowerCase();
    const owner = ownerIdx !== -1 ? String(row[ownerIdx]).toLowerCase() : '';
    const target = String(username).toLowerCase();
    
    const match = assignee.includes(target) || owner.includes(target);
    if (match) {
      keys.add(row[keyIdx]);
    }
    return match;
  });

  if (filteredRows.length > 0) {
    targetSheet.getRange(2, 1, filteredRows.length, filteredRows[0].length).setValues(filteredRows);
  }
  
  return keys;
}

/**
 * Copies ManualData rows where Jira # is in the provided keys set.
 */
function copyFilteredManualData_(sourceSS, targetSS, validKeys) {
  const sourceSheet = sourceSS.getSheetByName(MANUAL_DATA_SHEET);
  const targetSheet = targetSS.getSheetByName(MANUAL_DATA_SHEET);

  if (!sourceSheet || !targetSheet || sourceSheet.getLastRow() <= 1) return;

  const data = sourceSheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  const keyIdx = headers.indexOf('Jira #');
  if (keyIdx === -1) return;

  const filteredRows = rows.filter(row => validKeys.has(row[keyIdx]));

  if (filteredRows.length > 0) {
    targetSheet.getRange(2, 1, filteredRows.length, filteredRows[0].length).setValues(filteredRows);
  }
}

/**
 * Copies IndependentTasks rows where Assignee or Owner matches the username.
 */
function copyFilteredIndependentTasks_(sourceSS, targetSS, username) {
  const sourceSheet = sourceSS.getSheetByName(INDEPENDENT_TASKS_SHEET);
  const targetSheet = targetSS.getSheetByName(INDEPENDENT_TASKS_SHEET);

  if (!sourceSheet || !targetSheet || sourceSheet.getLastRow() <= 1) return;

  const data = sourceSheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  const assigneeIdx = headers.indexOf('Assignee');
  const ownerIdx = headers.indexOf('Owner');

  if (assigneeIdx === -1) return;

  const filteredRows = rows.filter(row => {
    const assignee = String(row[assigneeIdx]).toLowerCase();
    const owner = ownerIdx !== -1 ? String(row[ownerIdx]).toLowerCase() : '';
    const target = String(username).toLowerCase();
    
    return assignee.includes(target) || owner.includes(target);
  });

  if (filteredRows.length > 0) {
    targetSheet.getRange(2, 1, filteredRows.length, filteredRows[0].length).setValues(filteredRows);
  }
}

/**
 * Helper to copy data from one sheet to another.
 * Appends data to preserve headers created by setupSheets.
 */
function copySheetData_(sourceSS, targetSS, sheetName) {
  const sourceSheet = sourceSS.getSheetByName(sheetName);
  const targetSheet = targetSS.getSheetByName(sheetName);

  if (!sourceSheet || !targetSheet) return;

  const lastRow = sourceSheet.getLastRow();
  const lastCol = sourceSheet.getLastColumn();

  // If there's data beyond headers (assuming row 1 is header)
  if (lastRow > 1) {
    const data = sourceSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    
    // Write to target starting at row 2
    if (data.length > 0) {
      targetSheet.getRange(2, 1, data.length, lastCol).setValues(data);
    }
  }
}
