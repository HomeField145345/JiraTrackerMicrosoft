/**
 * @file Setup.gs
 * @description Contains functions to set up the project sheets and generate mock data.
 * 
 * NOTE: This file uses the constants declared in Constants.js
 * (JIRA_DATA_SHEET, MANUAL_DATA_SHEET, CONFIG_SHEET, INDEPENDENT_TASKS_SHEET)
 */

/**
 * Adds a custom menu to the spreadsheet UI.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Project Setup')
    .addItem('1. Create Backend Sheets', 'setupSheets')
    .addSeparator()
    .addItem('2. Generate Mock Data', 'createMockData')
    .addSeparator()
    .addItem('Migrate: Resolution → Project Stage', 'migrateResolutionToProjectStage')
    .addItem('Migrate: Add Priority Column', 'addPriorityColumnToManualData')
    .addItem('Migrate: Add New Jira Fields', 'addNewJiraFields')
    .addItem('Migrate: Add Owner Column', 'addOwnerColumn')
    .addItem('Migrate: Clean Column Headers', 'cleanupColumnHeaders')
    .addItem('Migrate: Upgrade Users Sheet', 'upgradeUsersSheet')
    .addItem('Migrate: Add Data Sheet ID Column', 'addUserDataSheetColumn')
    .addItem('Migrate: Format Timestamp Columns', 'formatTimestampColumns')
    .addToUi();
}

/**
 * Adds the 'Data Sheet ID' column to Users sheet if missing.
 */
function addUserDataSheetColumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(USERS_SHEET);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Users sheet not found.');
    return;
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  // Check if column 10 (index 9) exists and is named correctly
  if (headers.length < 10 || headers[9] !== 'Data Sheet ID') {
      sheet.getRange(1, 10).setValue('Data Sheet ID').setFontWeight('bold');
      SpreadsheetApp.getUi().alert('Added "Data Sheet ID" column to Users sheet.');
  } else {
      SpreadsheetApp.getUi().alert('"Data Sheet ID" column already exists.');
  }
}

/**
 * Adds the 'Owner' column to JiraData and IndependentTasks sheets if missing.
 */
function addOwnerColumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. JiraData
  const jiraSheet = ss.getSheetByName(JIRA_DATA_SHEET);
  if (jiraSheet) {
    const headers = jiraSheet.getRange(1, 1, 1, jiraSheet.getLastColumn()).getValues()[0];
    if (!headers.includes('Owner')) {
      jiraSheet.getRange(1, headers.length + 1).setValue('Owner').setFontWeight('bold');
      SpreadsheetApp.getUi().alert('Added Owner column to JiraData.');
    }
  }
  
  // 2. IndependentTasks
  const tasksSheet = ss.getSheetByName(INDEPENDENT_TASKS_SHEET);
  if (tasksSheet) {
    const headers = tasksSheet.getRange(1, 1, 1, tasksSheet.getLastColumn()).getValues()[0];
    if (!headers.includes('Owner')) {
      tasksSheet.getRange(1, headers.length + 1).setValue('Owner').setFontWeight('bold');
      SpreadsheetApp.getUi().alert('Added Owner column to IndependentTasks.');
    }
  }
}

/**
 * Creates the required sheets and adds headers if they don't exist.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [targetSpreadsheet] - Optional spreadsheet to setup. Defaults to Active.
 * @returns {string[]} Log of actions performed.
 */
function setupSheets(targetSpreadsheet) {
  const ss = targetSpreadsheet || SpreadsheetApp.getActiveSpreadsheet();
  const logs = [];
  
  const sheets = {
    [JIRA_DATA_SHEET]: ['Sync Status', 'Jira #', 'Summary', 'Status', 'Issue Type', 'Assignee', 'sprint', 'Epic Link', 'PM Lead', 'Story Points', 'Updated', 'Resolved', 'Created', 'Resolution', 'Acceptance Criteria', 'Target Date', 'Fix Version', 'Owner', 'UAT Status', 'Links', 'Labels', 'Description'],
    [MANUAL_DATA_SHEET]: ['Jira #', 'ACT/PCT', 'Planning Stage', 'Project Stage', 'Last Checked', 'Start Date', 'End Date', 'Drive Link', 'Priority'],
    [CONFIG_SHEET]: ['ACT/PCT Options', 'Planning Stage Options', 'Project Stage Options', 'HelpfulLinks', 'Epic Project Stage Options', 'Story Project Stage Options', 'Bug Project Stage Options'],
    [INDEPENDENT_TASKS_SHEET]: ['ID', 'Title', 'Assignee', 'Status', 'Priority', 'Due', 'Project', 'Tags', 'Description', 'Owner'],
    [USERS_SHEET]: ['ID', 'Username', 'Email', 'Display Name', 'Role', 'Is Active', 'Password', 'Created At', 'Last Login At', 'Data Sheet ID'],
    [SESSIONS_SHEET]: ['Token', 'Username', 'Role', 'Expiration', 'UserID'],
    [ADMIN_CONFIGS_SHEET]: ['Username', 'Config JSON', 'Updated At']
  };

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
             logs.push('Added "Data Sheet ID" to Users.');
         }
      }
    }
    
    // Create default admin user if Users sheet is empty
    if (sheetName === USERS_SHEET) {
      const userSheet = ss.getSheetByName(USERS_SHEET);
      if (userSheet && userSheet.getLastRow() === 1) {
        userSheet.appendRow([Utilities.getUuid(), 'admin', 'admin@example.com', 'Admin', 'admin', true, 'admin123', new Date(), '', '']);
        logs.push('Created default admin user.');
      }
    }
  }
  
  return logs.length > 0 ? logs : ['All sheets and headers are up to date.'];
}

/**
 * Migration function to update existing spreadsheet headers from "Resolution" to "Project Stage"
 */
function migrateResolutionToProjectStage() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    // Update Manual Data sheet header
    const manualSheet = ss.getSheetByName(MANUAL_DATA_SHEET);
    if (manualSheet) {
      const headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0];
      const resolutionIndex = headers.indexOf('Resolution');
      if (resolutionIndex !== -1) {
        manualSheet.getRange(1, resolutionIndex + 1).setValue('Project Stage');
        SpreadsheetApp.getUi().alert('Updated Manual Data sheet: "Resolution" → "Project Stage"');
      }
    }
    
    // Update Config sheet header
    const configSheet = ss.getSheetByName(CONFIG_SHEET);
    if (configSheet) {
      const headers = configSheet.getRange(1, 1, 1, configSheet.getLastColumn()).getValues()[0];
      const resolutionOptionsIndex = headers.indexOf('ResolutionOptions');
      if (resolutionOptionsIndex !== -1) {
        configSheet.getRange(1, resolutionOptionsIndex + 1).setValue('Project Stage Options');
        SpreadsheetApp.getUi().alert('Updated Config sheet: "ResolutionOptions" → "Project Stage Options"');
      }
    }
    
    SpreadsheetApp.getUi().alert('Migration completed successfully!');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Migration failed: ' + e.message);
  }
}

/**
 * Migration function to add Priority column to existing Manual Data sheet
 */
function addPriorityColumnToManualData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const manualSheet = ss.getSheetByName(MANUAL_DATA_SHEET);
    if (manualSheet) {
      const headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0];
      
      // Check if Priority column already exists
      if (headers.indexOf('Priority') === -1) {
        // Add Priority header to column 9
        manualSheet.getRange(1, 9).setValue('Priority');
        SpreadsheetApp.getUi().alert('Added "Priority" column to Manual Data sheet in column 9.');
      } else {
        SpreadsheetApp.getUi().alert('Priority column already exists in Manual Data sheet.');
      }
    } else {
      SpreadsheetApp.getUi().alert('Manual Data sheet not found. Please run "1. Create Backend Sheets" first.');
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('Migration failed: ' + e.message);
  }
}

/**
 * Migration function to add new Jira fields (Acceptance Criteria and Target Date) to existing JiraData sheet
 */
function addNewJiraFields() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const jiraSheet = ss.getSheetByName(JIRA_DATA_SHEET);
    if (jiraSheet) {
      const headers = jiraSheet.getRange(1, 1, 1, jiraSheet.getLastColumn()).getValues()[0];
      let columnsAdded = [];
      
      // Add Acceptance Criteria column (O) if missing
      if (headers.indexOf('Acceptance Criteria') === -1) {
        jiraSheet.insertColumnAfter(headers.length);
        jiraSheet.getRange(1, headers.length + 1).setValue('Acceptance Criteria');
        columnsAdded.push('Acceptance Criteria (Column O)');
      }
      
      // Add Target Date column (P) if missing
      const updatedHeaders = jiraSheet.getRange(1, 1, 1, jiraSheet.getLastColumn()).getValues()[0];
      if (updatedHeaders.indexOf('Target Date') === -1) {
        jiraSheet.insertColumnAfter(updatedHeaders.length);
        jiraSheet.getRange(1, updatedHeaders.length + 1).setValue('Target Date');
        columnsAdded.push('Target Date (Column P)');
      }
      
      // Add Fix Version column (Q) if missing
      const updatedHeaders2 = jiraSheet.getRange(1, 1, 1, jiraSheet.getLastColumn()).getValues()[0];
      if (updatedHeaders2.indexOf('Fix Version') === -1) {
        jiraSheet.insertColumnAfter(updatedHeaders2.length);
        jiraSheet.getRange(1, updatedHeaders2.length + 1).setValue('Fix Version');
        columnsAdded.push('Fix Version (Column Q)');
      }

      // Add Links column (R) if missing
      const updatedHeaders3 = jiraSheet.getRange(1, 1, 1, jiraSheet.getLastColumn()).getValues()[0];
      if (updatedHeaders3.indexOf('Links') === -1) {
        jiraSheet.insertColumnAfter(updatedHeaders3.length);
        jiraSheet.getRange(1, updatedHeaders3.length + 1).setValue('Links');
        columnsAdded.push('Links (Column R)');
      }

      // Add Labels column if missing
      const updatedHeaders4 = jiraSheet.getRange(1, 1, 1, jiraSheet.getLastColumn()).getValues()[0];
      if (updatedHeaders4.indexOf('Labels') === -1) {
        jiraSheet.insertColumnAfter(updatedHeaders4.length);
        jiraSheet.getRange(1, updatedHeaders4.length + 1).setValue('Labels');
        columnsAdded.push('Labels');
      }

      // Add Description column if missing
      const updatedHeaders5 = jiraSheet.getRange(1, 1, 1, jiraSheet.getLastColumn()).getValues()[0];
      if (updatedHeaders5.indexOf('Description') === -1) {
        jiraSheet.insertColumnAfter(updatedHeaders5.length);
        jiraSheet.getRange(1, updatedHeaders5.length + 1).setValue('Description');
        columnsAdded.push('Description');
      }
      
      if (columnsAdded.length > 0) {
        SpreadsheetApp.getUi().alert('Successfully added new fields to JiraData sheet: ' + columnsAdded.join(', ') + '\n\nThese fields will now be imported from your Jira CSV exports.');
      } else {
        SpreadsheetApp.getUi().alert('All new fields already exist in the JiraData sheet:\n- Acceptance Criteria\n- Target Date\n- Fix Version\n- Links\n- Labels\n- Description');
      }
    } else {
      SpreadsheetApp.getUi().alert('JiraData sheet not found. Please run "1. Create Backend Sheets" first.');
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('Migration failed: ' + e.message);
  }
}

/**
 * Migration function to clean up column headers with trailing spaces
 */
function cleanupColumnHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const jiraSheet = ss.getSheetByName(JIRA_DATA_SHEET);
    if (jiraSheet) {
      const headers = jiraSheet.getRange(1, 1, 1, jiraSheet.getLastColumn()).getValues()[0];
      let cleanedHeaders = [];
      let changesMade = false;
      
      for (let i = 0; i < headers.length; i++) {
        const originalHeader = headers[i];
        const cleanedHeader = String(originalHeader).trim();
        cleanedHeaders.push(cleanedHeader);
        
        if (originalHeader !== cleanedHeader) {
          jiraSheet.getRange(1, i + 1).setValue(cleanedHeader);
          changesMade = true;
        }
      }
      
      if (changesMade) {
        SpreadsheetApp.getUi().alert('Column headers cleaned up successfully! Removed trailing/leading spaces from headers.');
      } else {
        SpreadsheetApp.getUi().alert('All column headers are already clean - no changes needed.');
      }
    } else {
      SpreadsheetApp.getUi().alert('JiraData sheet not found. Please run "1. Create Backend Sheets" first.');
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('Header cleanup failed: ' + e.message);
  }
}

/**
 * Generates 100 rows of mock data across the JiraData, ManualData, and IndependentTasks sheets.
 */
function createMockData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jiraSheet = ss.getSheetByName(JIRA_DATA_SHEET);
  const manualSheet = ss.getSheetByName(MANUAL_DATA_SHEET);
  const tasksSheet = ss.getSheetByName(INDEPENDENT_TASKS_SHEET);
  const optionsSheet = ss.getSheetByName(CONFIG_SHEET);

  if (!jiraSheet || !manualSheet || !tasksSheet || !optionsSheet) {
    SpreadsheetApp.getUi().alert('Please run "1. Create Backend Sheets" first.');
    return;
  }

  // Clear existing mock data
  if (jiraSheet.getLastRow() > 1) jiraSheet.getRange(2, 1, jiraSheet.getLastRow() - 1, jiraSheet.getLastColumn()).clearContent();
  if (manualSheet.getLastRow() > 1) manualSheet.getRange(2, 1, manualSheet.getLastRow() - 1, manualSheet.getLastColumn()).clearContent();
  if (tasksSheet.getLastRow() > 1) tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, tasksSheet.getLastColumn()).clearContent();
  if (optionsSheet.getLastRow() > 1) optionsSheet.getRange(2, 1, optionsSheet.getLastRow() - 1, optionsSheet.getLastColumn()).clearContent();


  const jiraData = [];
  const manualData = [];
  const tasksData = [];
  
  const statuses = ['In Progress', 'System Test', 'Retest', 'Ready for Production', 'Fixed', 'Closed'];
  const projectStages = ['', 'Ideation', 'Planning', 'Business Grooming', 'Ready for Iteration', 'Development in Progress', 'System Testing', 'UAT', 'Ready for Production', 'In Production', 'Done', 'Blocked'];
  const planningStages = ['In Flight', 'Planning', 'Backlog'];
  const assignees = ['Smith, John', 'Doe, Jane', 'Krishnan, Priya', 'Chen, Wei', 'Garcia, Maria'];
  const pmLeads = ['Krabin, Chris', 'Manager, Mike'];
  const resolutions = ['Fixed', 'Done', 'Won\'t Fix', 'Duplicate', 'Cannot Reproduce', ''];

  let epicCounter = 1;
  for (let i = 1; i <= 100; i++) {
    const isEpic = i % 10 === 1;
    const jiraId = `ACT279-${3000 + i}`;
    const epicLink = isEpic ? '' : `Epic ${epicCounter} - Dashboard Overhaul`;
    const issueType = isEpic ? 'Epic' : (i % 7 === 0 ? 'Bug' : 'Story');
    const summary = isEpic ? `Epic ${epicCounter} - Dashboard Overhaul` : (issueType === 'Bug' ? 'Fix UI glitch on dashboard' : `Implement feature ${i}`);
    
    // Create dynamic sprint data
    const currentSprintNum = 99;
    let sprintNum = currentSprintNum - Math.floor(Math.random() * 5); // Sprints 95-99
    if (i > 80) sprintNum = currentSprintNum + 1; // Future sprint
    if (i < 20) sprintNum = currentSprintNum - 10; // Old sprint
    const sprint = `Sprint ${sprintNum} ${new Date().toLocaleDateString()} - ${new Date().toLocaleDateString()} PCT51`;

    // Create a resolved date for some items
    const resolvedDate = i % 3 === 0 ? new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000) : null;
    
    // Create sample acceptance criteria
    const acceptanceCriteria = isEpic ? '' : (i % 4 === 0 ? 'Given user is logged in\nWhen they click the button\nThen the action should complete' : '');
    
    // Create sample target date (some items have target dates, others don't)
    const targetDate = i % 3 === 0 ? new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000) : null;
    
    // Create sample fix version (some items have fix versions, others don't)
    const fixVersions = ['v1.0', 'v1.1', 'v1.2', 'v2.0', 'v2.1'];
    const fixVersion = i % 4 === 0 ? fixVersions[i % fixVersions.length] : '';

    jiraData.push([
      '✅', jiraId, summary, statuses[i % statuses.length], issueType,
      assignees[i % assignees.length], sprint, epicLink, pmLeads[i % pmLeads.length],
      isEpic ? '' : Math.floor(Math.random() * 5) + 1, new Date(), resolvedDate, new Date(),
      resolutions[i % resolutions.length], acceptanceCriteria, targetDate, fixVersion
    ]);

    manualData.push([
      jiraId, 'ACT', planningStages[i % planningStages.length], projectStages[i % projectStages.length],
      new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), 
      new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000), 
      new Date(Date.now() + Math.random() * 60 * 24 * 60 * 60 * 1000), 
      'https://drive.google.com/drive/folders/example'
    ]);
    
    if (isEpic) epicCounter++;
  }

  // Generate some independent tasks
  for (let i = 1; i <= 5; i++) {
    tasksData.push([
      Utilities.getUuid(), `Independent Task ${i}`, assignees[i % assignees.length],
      'In Progress', 'Medium', new Date(), 'Internal Project', 'ops, admin', 'Description for task ' + i
    ]);
  }
  
  // Set default options
  const actOptions = [['ACT'], ['PCT']];
  const planOptions = [['In Flight'], ['Planning'], ['Backlog'], ['On Hold'], ['Closed'], ['Canceled']];
  const projectStageOptions = [[''], ['Ideation'], ['Planning'], ['Business Grooming'], ['GTS Grooming'], ['Ready for Iteration'], ['Development in Progress'], ['System Testing'], ['UAT'], ['Ready for Production'], ['In Production'], ['Done'], ['Blocked'], ['Canceled']];
  // Defaults for per-type project stage options; start with the same set as global
  const epicProjectStageOptions = projectStageOptions;
  const storyProjectStageOptions = projectStageOptions;
  const bugProjectStageOptions = projectStageOptions;
  const linksJson = JSON.stringify([
      { title: "Project Brief", url: "https://docs.google.com" },
      { title: "Team Roster", url: "https://sheets.google.com" }
  ]);


  // Write data to sheets
  if (jiraData.length > 0) {
    jiraSheet.getRange(2, 1, jiraData.length, jiraData[0].length).setValues(jiraData);
  }
  if (manualData.length > 0) {
    manualSheet.getRange(2, 1, manualData.length, manualData[0].length).setValues(manualData);
  }
  if (tasksData.length > 0) {
    tasksSheet.getRange(2, 1, tasksData.length, tasksData[0].length).setValues(tasksData);
  }
  optionsSheet.getRange(2, 1, actOptions.length, 1).setValues(actOptions);
  optionsSheet.getRange(2, 2, planOptions.length, 1).setValues(planOptions);
  optionsSheet.getRange(2, 3, projectStageOptions.length, 1).setValues(projectStageOptions);
  optionsSheet.getRange("D2").setValue(linksJson);
  // Write per-type options to columns E, F, G
  optionsSheet.getRange(2, 5, epicProjectStageOptions.length, 1).setValues(epicProjectStageOptions);
  optionsSheet.getRange(2, 6, storyProjectStageOptions.length, 1).setValues(storyProjectStageOptions);
  optionsSheet.getRange(2, 7, bugProjectStageOptions.length, 1).setValues(bugProjectStageOptions);


  SpreadsheetApp.getUi().alert('Successfully generated 100 mock rows of data!');
}

/**
 * Upgrades the Users sheet to the new format (v2).
 * Old: Username, Password, Role, Email
 * New: ID, Username, Email, Display Name, Role, Is Active, Password, Created At, Last Login At
 */
function upgradeUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(USERS_SHEET);
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Users sheet not found. Run "Create Backend Sheets" first.');
    return;
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Check if already upgraded (check for 'ID' column)
  if (headers[0] === 'ID') {
    SpreadsheetApp.getUi().alert('Users sheet appears to be already upgraded.');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  // Remove header
  data.shift();
  
  // Map old data to new structure
  const newRows = data.map(row => {
    const username = row[0];
    const password = row[1];
    const role = row[2];
    const email = row[3];
    
    return [
      Utilities.getUuid(), // ID
      username,            // Username
      email,               // Email
      username,            // Display Name (default to username)
      role,                // Role
      true,                // Is Active
      password,            // Password
      new Date(),          // Created At
      ''                   // Last Login At
    ];
  });
  
  // Clear and reset sheet
  sheet.clear();
  
  // Set new headers
  const newHeaders = ['ID', 'Username', 'Email', 'Display Name', 'Role', 'Is Active', 'Password', 'Created At', 'Last Login At'];
  sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]).setFontWeight('bold');
  
  // Write new data
  if (newRows.length > 0) {
    sheet.getRange(2, 1, newRows.length, newHeaders.length).setValues(newRows);
  }
  
  SpreadsheetApp.getUi().alert('Users sheet upgraded successfully.');
}

/**
 * Format timestamp columns to show date and time
 */
function formatTimestampColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  try {
    // Format JiraData timestamp columns
    const jiraSheet = ss.getSheetByName(JIRA_DATA_SHEET);
    if (jiraSheet) {
      const headers = jiraSheet.getRange(1, 1, 1, jiraSheet.getLastColumn()).getValues()[0];
      const timestampFields = ['Updated', 'Created', 'Resolved'];
      
      timestampFields.forEach(function(field) {
        const colIndex = headers.indexOf(field);
        if (colIndex !== -1 && jiraSheet.getLastRow() > 1) {
          const range = jiraSheet.getRange(2, colIndex + 1, jiraSheet.getLastRow() - 1, 1);
          range.setNumberFormat('MM/dd/yyyy HH:mm:ss');
        }
      });
    }
    
    // Format ManualData Last Checked column
    const manualSheet = ss.getSheetByName(MANUAL_DATA_SHEET);
    if (manualSheet) {
      const headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0];
      const colIndex = headers.indexOf('Last Checked');
      if (colIndex !== -1 && manualSheet.getLastRow() > 1) {
        const range = manualSheet.getRange(2, colIndex + 1, manualSheet.getLastRow() - 1, 1);
        range.setNumberFormat('MM/dd/yyyy HH:mm:ss');
      }
    }
    
    ui.alert('Timestamp columns formatted successfully!\n\nFormatted columns:\n- JiraData: Updated, Created, Resolved\n- ManualData: Last Checked');
  } catch (e) {
    ui.alert('Error formatting columns: ' + e.message);
  }
}
