/**
 * @file SheetOperations.js
 * @description Handles creation and management of user-specific data spreadsheets (Hub & Spoke).
 */

/**
 * Creates a new dedicated Data Spreadsheet for a specific user.
 * This creates a new FILE (Spreadsheet) and copies the structure.
 * 
 * @param {Object} user - The user object {username, email, ...}
 * @returns {string} The ID of the created spreadsheet
 */
function createUserDataSpreadsheet(user) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const newSSName = `Jira Tracker Data - ${user.username}`;
  
  // Create new Spreadsheet
  const newSS = SpreadsheetApp.create(newSSName);
  const newSSId = newSS.getId();
  
  // NOTE: We do NOT share the sheet with the user.
  // The application runs as the script owner ("Execute as Me"), 
  // so the script has access to the file it created.
  // The user interacts with the data solely through the Web App UI.
  
  // Copy Sheets
  const sheetsToCopy = [JIRA_DATA_SHEET, MANUAL_DATA_SHEET, INDEPENDENT_TASKS_SHEET];
  
  sheetsToCopy.forEach(sheetName => {
    const sourceSheet = ss.getSheetByName(sheetName);
    if (sourceSheet) {
      const newSheet = sourceSheet.copyTo(newSS);
      newSheet.setName(sheetName);
      
      // Clear Data (keep headers)
      // For JiraData, we might want to keep it empty initially
      // For ManualData, definitely empty
      const lastRow = newSheet.getLastRow();
      if (lastRow > 1) {
        newSheet.getRange(2, 1, lastRow - 1, newSheet.getLastColumn()).clearContent();
      }
    } else {
      // If source doesn't exist, create blank with headers?
      // For now, assume source exists as this is the template
      console.warn(`Source sheet ${sheetName} not found in template.`);
    }
  });
  
  // Delete default "Sheet1"
  const defaultSheet = newSS.getSheetByName('Sheet1');
  if (defaultSheet) newSS.deleteSheet(defaultSheet);
  
  return newSSId;
}

/**
 * Helper to get a sheet or throw error if missing
 */
function getSheetOrThrow(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found in spreadsheet "${ss.getName()}"`);
  return sheet;
}

/**
 * Reads Jira data from the sheet and returns an array of objects.
 * @param {Sheet} sheet
 * @returns {Array<Object>}
 */
function readJiraData(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header) {
        // Use normalizeValue_ if available, otherwise just raw value
        obj[header] = typeof normalizeValue_ === 'function' ? normalizeValue_(row[index]) : row[index];
      }
    });
    return obj;
  });
}

/**
 * Reads Manual Data overrides and returns a map keyed by Jira ID.
 * @param {Sheet} sheet
 * @returns {Object} Map of JiraID -> Object
 */
function readManualData(sheet) {
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return {};
  
  const headers = data[0];
  const rows = data.slice(1);
  const map = {};
  
  // Find "Jira #" column index
  const idIndex = headers.indexOf("Jira #");
  if (idIndex === -1) return {};
  
  rows.forEach(row => {
    const jiraId = row[idIndex];
    if (jiraId) {
      const obj = {};
      headers.forEach((header, index) => {
        if (header && index !== idIndex) {
           obj[header] = typeof normalizeValue_ === 'function' ? normalizeValue_(row[index]) : row[index];
        }
      });
      map[jiraId] = obj;
    }
  });
  
  return map;
}

/**
 * Reads Independent Tasks.
 * @param {Sheet} sheet
 * @returns {Array<Object>}
 */
function readIndependentTasks(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header) {
        obj[header] = typeof normalizeValue_ === 'function' ? normalizeValue_(row[index]) : row[index];
      }
    });
    // Mark as independent task
    obj.isIndependent = true;
    return obj;
  });
}
