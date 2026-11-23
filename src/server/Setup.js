/**
 * @file Setup.js
 * @description Creates the worksheets and headers the application needs.
 *
 * NOTE: This file uses the constants declared in Constants.js
 * (JIRA_DATA_SHEET, MANUAL_DATA_SHEET, CONFIG_SHEET, INDEPENDENT_TASKS_SHEET)
 *
 * The Google Sheets editor menu and its one-time legacy migrations (setup.js in the Apps Script
 * project) are not ported: new workbooks are created with the current schema, and
 * setupSheets() repairs missing worksheets and columns.
 */

function trackerSheetSchema() {
  return {
    [JIRA_DATA_SHEET]: ['Sync Status', 'Jira #', 'Summary', 'Status', 'Issue Type', 'Assignee', 'sprint', 'Epic Link', 'PM Lead', 'Story Points', 'Updated', 'Resolved', 'Created', 'Resolution', 'Acceptance Criteria', 'Target Date', 'Fix Version', 'Owner', 'UAT Status', 'Links', 'Labels', 'Description'],
    [MANUAL_DATA_SHEET]: ['Jira #', 'ACT/PCT', 'Planning Stage', 'Project Stage', 'Last Checked', 'Start Date', 'End Date', 'Drive Link', 'Priority', 'Artifacts'],
    [CONFIG_SHEET]: ['ACT/PCT Options', 'Planning Stage Options', 'Project Stage Options', 'HelpfulLinks', 'Epic Project Stage Options', 'Story Project Stage Options', 'Bug Project Stage Options', 'Closed Project Stages', 'Closed Status Keywords', 'Stage→Status (JSON)', 'Stage→Status Keywords', 'Past Sprint Closed Project Stages', 'Priority Options', '', 'Past Due Exempt Stages', 'KPI Project Stages', 'Independent Task Status Options', 'Not In Progress Statuses'],
    [INDEPENDENT_TASKS_SHEET]: ['ID', 'Title', 'Assignee', 'Status', 'Priority', 'Due', 'Project', 'Tags', 'Description', 'Owner', 'Recurrence', 'TaskListId', 'GoogleTaskId', 'Created', 'Updated', 'CompletedDate'],
    [DEVELOPER_CAPACITY_SHEET]: ['Developer', 'Capacity', 'Notes', 'Updated', 'Manager', 'SprintOverrides'],
    [USERS_SHEET]: ['ID', 'Username', 'Email', 'Display Name', 'Role', 'Is Active', 'Password', 'Created At', 'Last Login At', 'Data Sheet ID', 'Microsoft Object ID'],
    [SESSIONS_SHEET]: ['Token', 'Username', 'Role', 'Expiration', 'UserID'],
    [ADMIN_CONFIGS_SHEET]: ['Username', 'Config JSON', 'Updated At']
  };
}

/**
 * Creates or repairs tracker sheets. Cloud storage authenticates externally and needs no local admin.
 * @param {Workbook} [targetSpreadsheet] Defaults to the primary workbook.
 * @param {boolean} [seedLocalAdmin] Whether to create the browser-only admin profile.
 * @returns {string[]} Log of actions performed.
 */
function setupSheets(targetSpreadsheet, seedLocalAdmin = true) {
  const ss = targetSpreadsheet || WorkbookService.getActiveWorkbook();
  const logs = [];
  const sheets = trackerSheetSchema();

  for (const sheetName in sheets) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, sheets[sheetName].length).setValues([sheets[sheetName]]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      logs.push(`Created sheet "${sheetName}".`);
    } else {
      // --- Add missing columns to JiraData if missing ---
      if (sheetName === JIRA_DATA_SHEET) {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        
        // Add Acceptance Criteria column (O) if missing
        if (headers.indexOf('Acceptance Criteria') === -1) {
          sheet.insertColumnAfter(headers.length);
          sheet.getRange(1, headers.length + 1).setValue('Acceptance Criteria');
          logs.push('Added "Acceptance Criteria" to JiraData.');
        }
        
        // Add Target Date column (P) if missing
        const updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        if (updatedHeaders.indexOf('Target Date') === -1) {
          sheet.insertColumnAfter(updatedHeaders.length);
          sheet.getRange(1, updatedHeaders.length + 1).setValue('Target Date');
          logs.push('Added "Target Date" to JiraData.');
        }
        
        // Add Fix Version column (Q) if missing
        const updatedHeaders2 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        if (updatedHeaders2.indexOf('Fix Version') === -1) {
          sheet.insertColumnAfter(updatedHeaders2.length);
          sheet.getRange(1, updatedHeaders2.length + 1).setValue('Fix Version');
          logs.push('Added "Fix Version" to JiraData.');
        }
        
        // Add Owner column if missing
        const updatedHeaders3 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        if (updatedHeaders3.indexOf('Owner') === -1) {
          sheet.insertColumnAfter(updatedHeaders3.length);
          sheet.getRange(1, updatedHeaders3.length + 1).setValue('Owner').setFontWeight('bold');
          logs.push('Added "Owner" to JiraData.');
        }

        // Add Labels column if missing
        const updatedHeaders4 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        if (updatedHeaders4.indexOf('Labels') === -1) {
          sheet.insertColumnAfter(updatedHeaders4.length);
          sheet.getRange(1, updatedHeaders4.length + 1).setValue('Labels').setFontWeight('bold');
          logs.push('Added "Labels" to JiraData.');
        }

        // Add Description column if missing
        const updatedHeaders5 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        if (updatedHeaders5.indexOf('Description') === -1) {
          sheet.insertColumnAfter(updatedHeaders5.length);
          sheet.getRange(1, updatedHeaders5.length + 1).setValue('Description').setFontWeight('bold');
          logs.push('Added "Description" to JiraData.');
        }
      }
      
      // --- Add missing columns to Users if missing ---
      if (sheetName === USERS_SHEET) {
         const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
         if (headers.indexOf('Data Sheet ID') === -1) {
           sheet.getRange(1, headers.length + 1).setValue('Data Sheet ID').setFontWeight('bold');
           headers.push('Data Sheet ID');
           logs.push('Added "Data Sheet ID" to Users.');
         }
         if (headers.indexOf('Microsoft Object ID') === -1) {
           sheet.getRange(1, headers.length + 1).setValue('Microsoft Object ID').setFontWeight('bold');
           logs.push('Added "Microsoft Object ID" to Users.');
         }
      }
    }
    
    // Create default admin user if Users sheet is empty
    if (seedLocalAdmin && sheetName === USERS_SHEET) {
      const userSheet = ss.getSheetByName(USERS_SHEET);
      if (userSheet && userSheet.getLastRow() === 1) {
        // No password is stored: the browser build signs in with a local profile (see Auth.js).
        userSheet.appendRow([Platform.uuid(), 'admin', 'admin@example.com', 'Admin', 'admin', true, '', new Date(), '', '', '']);
        logs.push('Created default admin user.');
      }
    }
  }
  
  return logs.length > 0 ? logs : ['All sheets and headers are up to date.'];
}
