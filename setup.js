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
    .addToUi();
}

/**
 * Creates the required sheets and adds headers if they don't exist.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = {
    [JIRA_DATA_SHEET]: ['Sync Status', 'Jira #', 'Summary', 'Status', 'Issue Type', 'Assignee', 'sprint', 'Epic Link', 'PM Lead', 'Story Points', 'Updated', 'Resolved', 'Created', 'Resolution'],
    [MANUAL_DATA_SHEET]: ['Jira #', 'ACT/PCT', 'Planning Stage', 'Project Stage', 'Last Checked', 'Start Date', 'End Date', 'Drive Link', 'Priority'],
    [CONFIG_SHEET]: ['ACT/PCT Options', 'Planning Stage Options', 'Project Stage Options', 'HelpfulLinks', 'Epic Project Stage Options', 'Story Project Stage Options', 'Bug Project Stage Options'],
    [INDEPENDENT_TASKS_SHEET]: ['ID', 'Title', 'Assignee', 'Status', 'Priority', 'Due', 'Project', 'Tags', 'Description']
  };

  for (const sheetName in sheets) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, sheets[sheetName].length).setValues([sheets[sheetName]]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      SpreadsheetApp.getUi().alert(`Sheet "${sheetName}" was created successfully.`);
    } else {
      SpreadsheetApp.getUi().alert(`Sheet "${sheetName}" already exists.`);
    }
  }
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

    jiraData.push([
      '✅', jiraId, summary, statuses[i % statuses.length], issueType,
      assignees[i % assignees.length], sprint, epicLink, pmLeads[i % pmLeads.length],
      isEpic ? '' : Math.floor(Math.random() * 5) + 1, new Date(), resolvedDate, new Date(),
      resolutions[i % resolutions.length]
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
