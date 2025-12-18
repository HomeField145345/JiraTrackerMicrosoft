/**
 * @file ContextRouter.gs
 * @description Handles routing to the correct spreadsheet based on the user context.
 */

/**
 * Gets the Data Spreadsheet for a specific user.
 * If the user has a configured Data Sheet ID, it opens that.
 * Otherwise, it falls back to the Global (Active) Spreadsheet.
 * 
 * @param {Object} user - The user object (must include dataSheetId if configured).
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} The spreadsheet object.
 */
function getDataSpreadsheet(user) {
  if (user && user.dataSheetId) {
    try {
      return SpreadsheetApp.openById(user.dataSheetId);
    } catch (e) {
      console.warn(`Failed to open Data Sheet ID ${user.dataSheetId} for user ${user.username}. Falling back to Global.`);
      // Fallback to global if the ID is invalid or permission denied
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Gets the Global Spreadsheet (Master Directory).
 * This is where Users and Configs are stored.
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getGlobalSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}
