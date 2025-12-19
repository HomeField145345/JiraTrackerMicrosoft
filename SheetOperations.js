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
