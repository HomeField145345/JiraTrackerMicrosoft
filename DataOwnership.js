/**
 * Updates the Owner field in data sheets when a username changes.
 * @param {string} oldUsername
 * @param {string} newUsername
 */
function updateDataOwnership(oldUsername, newUsername) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Update Independent Tasks
  const taskSheet = ss.getSheetByName(INDEPENDENT_TASKS_SHEET);
  if (taskSheet) {
    const data = taskSheet.getDataRange().getValues();
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
  
  // 2. Update Jira Data (Projects)
  const jiraSheet = ss.getSheetByName(JIRA_DATA_SHEET);
  if (jiraSheet) {
    const data = jiraSheet.getDataRange().getValues();
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
  
  // Clear cache to reflect changes
  if (typeof clearProjectCache === 'function') {
      clearProjectCache();
  }
}
