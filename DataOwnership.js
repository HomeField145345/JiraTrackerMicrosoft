/**
 * Updates the Owner field in data sheets when a username changes.
 * @param {string} oldUsername
 * @param {string} newUsername
 */
function updateDataOwnership(oldUsername, newUsername) {
  const globalSS = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Update Global Sheet
  updateSheetOwnership_(globalSS, oldUsername, newUsername);
  
  // 2. Check for Personal Sheet
  try {
    const usersSheet = globalSS.getSheetByName(USERS_SHEET);
    if (usersSheet) {
      const data = usersSheet.getDataRange().getValues();
      // Find user by newUsername (Column 2 / Index 1)
      // Note: updateUser updates the sheet BEFORE calling this, so we look for newUsername
      const userRow = data.find(r => String(r[1]).toLowerCase() === String(newUsername).toLowerCase());
      
      if (userRow) {
         // Data Sheet ID is at Index 9 (Column 10)
         const dataSheetId = userRow[9];
         if (dataSheetId && String(dataSheetId).trim() !== '') {
           try {
             const personalSS = SpreadsheetApp.openById(dataSheetId);
             updateSheetOwnership_(personalSS, oldUsername, newUsername);
           } catch (e) {
             console.error("Failed to update personal sheet for user " + newUsername, e);
           }
         }
      }
    }
  } catch (e) {
    console.error("Error checking for personal sheet update", e);
  }
  
  // Clear cache to reflect changes
  if (typeof clearProjectCache === 'function') {
      clearProjectCache(oldUsername);
      clearProjectCache(newUsername);
  }
}

/**
 * Helper to update ownership in a specific spreadsheet.
 * @param {Spreadsheet} ss
 * @param {string} oldUsername
 * @param {string} newUsername
 */
function updateSheetOwnership_(ss, oldUsername, newUsername) {
  // 1. Update Independent Tasks
  const taskSheet = ss.getSheetByName(INDEPENDENT_TASKS_SHEET);
  if (taskSheet) {
    const data = taskSheet.getDataRange().getValues();
    if (data.length > 1) {
      const headers = data[0];
      const ownerIndex = headers.indexOf('Owner');
      
      if (ownerIndex > -1) {
        for (let i = 1; i < data.length; i++) {
          const currentOwner = String(data[i][ownerIndex]);
          // Handle comma-separated owners if necessary
          if (currentOwner === oldUsername) {
            taskSheet.getRange(i + 1, ownerIndex + 1).setValue(newUsername);
          } else if (currentOwner.includes(oldUsername)) {
             // Handle "user1, user2" case
             const owners = currentOwner.split(',').map(function(s) { return s.trim(); });
             const index = owners.indexOf(oldUsername);
             if (index > -1) {
               owners[index] = newUsername;
               taskSheet.getRange(i + 1, ownerIndex + 1).setValue(owners.join(', '));
             }
          }
        }
      }
    }
  }
  
  // 2. Update Jira Data (Projects)
  const jiraSheet = ss.getSheetByName(JIRA_DATA_SHEET);
  if (jiraSheet) {
    const data = jiraSheet.getDataRange().getValues();
    if (data.length > 1) {
      const headers = data[0];
      const ownerIndex = headers.indexOf('Owner'); 
      
      if (ownerIndex > -1) {
        for (let i = 1; i < data.length; i++) {
          const currentOwner = String(data[i][ownerIndex]);
          if (currentOwner === oldUsername) {
            jiraSheet.getRange(i + 1, ownerIndex + 1).setValue(newUsername);
          } else if (currentOwner.includes(oldUsername)) {
             const owners = currentOwner.split(',').map(function(s) { return s.trim(); });
             const index = owners.indexOf(oldUsername);
             if (index > -1) {
               owners[index] = newUsername;
               jiraSheet.getRange(i + 1, ownerIndex + 1).setValue(owners.join(', '));
             }
          }
        }
      }
    }
  }
}
