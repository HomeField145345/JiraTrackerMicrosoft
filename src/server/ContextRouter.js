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
 * @param {boolean} [strictMode=false] - When true, throws if user has dataSheetId but it cannot be opened.
 * @returns {Workbook} The spreadsheet object.
 */
function getDataSpreadsheet(user, strictMode) {
  strictMode = strictMode === true;
  if (user && user.dataSheetId) {
    try {
      return WorkbookService.openById(user.dataSheetId);
    } catch (e) {
      if (strictMode) {
        throw new Error('Unable to open workspace data sheet for user ' + (user.username || 'unknown') + '. ' +
                        'Please verify spreadsheet access and web app execution permissions. Details: ' + e.message);
      }
      console.warn(`Failed to open Data Sheet ID ${user.dataSheetId} for user ${user.username}. Falling back to Global.`);
      // Fallback to global if the ID is invalid or permission denied
    }
  }
  return WorkbookService.getActiveWorkbook();
}

/**
 * Gets the Global Spreadsheet (Master Directory).
 * This is where Users and Configs are stored.
 * @returns {Workbook}
 */
function getGlobalSpreadsheet() {
  return WorkbookService.getActiveWorkbook();
}
