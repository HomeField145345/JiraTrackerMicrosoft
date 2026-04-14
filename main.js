/**
 * @file Main.gs
 * @description Main entry point and API router for the web app.
 */

function doGet(e) {
  var template;
  
  // Simple routing
  if (e.parameter.page === 'tasks') {
    template = HtmlService.createTemplateFromFile('Tasks.html');
  } else if (e.parameter.page === 'dashboard') {
    template = HtmlService.createTemplateFromFile('Dashboard.html');
  } else {
    // Default to Login page if no page param or unknown
    template = HtmlService.createTemplateFromFile('Login.html');
  }
  
  template.url = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle("Project Tracker")
    .setFaviconUrl('https://cdn-icons-png.flaticon.com/512/9757/9757813.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

function getPageHtml(page) {
  var template;
  if (page === 'dashboard') {
    template = HtmlService.createTemplateFromFile('Dashboard.html');
  } else if (page === 'tasks') {
    template = HtmlService.createTemplateFromFile('Tasks.html');
  } else {
    template = HtmlService.createTemplateFromFile('Login.html');
  }
  
  template.url = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle("Project Tracker")
    .setFaviconUrl('https://cdn-icons-png.flaticon.com/512/9757/9757813.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .getContent();
}

// --- Client-Callable API Functions ---

function requireAuth(token) {
  const auth = validateSession(token);
  if (!auth.valid) {
    throw new Error("Authentication failed: " + (auth.reason || "Invalid token"));
  }
  return auth;
}

function resolveDataContextUser(authUser, targetUsername) {
  let contextUser = authUser;

  // Ensure we have full user info (especially dataSheetId)
  if (contextUser && !contextUser.dataSheetId && contextUser.id) {
    const fullUser = getUserById(contextUser.id);
    if (fullUser) contextUser = fullUser;
  }

  if (!targetUsername || String(targetUsername).trim() === '') {
    return contextUser;
  }

  if (contextUser && contextUser.username === targetUsername) {
    return contextUser;
  }

  const role = String((contextUser && contextUser.role) || '').toLowerCase().replace(/\s+/g, '_');
  const canWriteToSelectedWorkspace = role === 'admin' || role === 'project_manager' || role.indexOf('qa') !== -1 || role.indexOf('tester') !== -1 || role.indexOf('view') !== -1;

  if (!canWriteToSelectedWorkspace) {
    throw new Error('Access denied: Cannot write to another workspace.');
  }

  const users = getUsers();
  const targetUser = users.find(function(u) { return u.username === targetUsername; });
  if (!targetUser) {
    throw new Error('Target workspace user not found: ' + targetUsername);
  }

  return targetUser;
}

function forceGetProjectData(token) {
  const auth = requireAuth(token);
  return forceGetProjectData_(auth.user);
}

function getProjectData(token, targetUsername) {
  const auth = requireAuth(token);
  var result = getProjectData_(auth.user, targetUsername);
  
  if (result === null) {
      return null;
  }
  
  // Force JSON serialization to avoid transport layer issues with complex objects
  try {
      var jsonString = JSON.stringify(result);
      // Quick sample of first project's timestamps to confirm server values pre-UI
      try {
        var parsed = JSON.parse(jsonString);
        if (parsed && parsed.projects && parsed.projects.length) {
          var p0 = parsed.projects[0];
        }
      } catch (inner) {}
      return jsonString;
  } catch (e) {
      throw e;
  }
}

function getConfigData(token) {
  const auth = requireAuth(token);
  return getConfigData_(auth.user);
}

function importJiraCsv(token, csvData, targetUsername) {
  const auth = requireAuth(token);
  const contextUser = resolveDataContextUser(auth.user, targetUsername);
  return importJiraCsv_(csvData, contextUser);
}

function importJiraFile(token, fileData, targetUsername) {
  const auth = requireAuth(token);
  const contextUser = resolveDataContextUser(auth.user, targetUsername);
  return importJiraCsv_(fileData, contextUser);
}

function saveConfiguration(token, optionsData) {
  const auth = requireAuth(token);
  if (auth.role !== 'admin') {
    throw new Error("Access denied: Admin rights required.");
  }
  return saveConfiguration_(optionsData);
}

function saveManualData(token, jiraId, field, value, targetUsername) {
  const auth = requireAuth(token);
  const contextUser = resolveDataContextUser(auth.user, targetUsername);
  return saveManualData_(jiraId, field, value, contextUser);
}

function saveIndependentTask(token, taskData, targetUsername) {
  const auth = requireAuth(token);
  const contextUser = resolveDataContextUser(auth.user, targetUsername);
  return saveIndependentTask_(taskData, contextUser);
}

function updateLastChecked(token, jiraId, targetUsername) {
  const auth = requireAuth(token);
  const contextUser = resolveDataContextUser(auth.user, targetUsername);
  return updateLastChecked_(jiraId, contextUser);
}

function updateSyncIndicators(token, mappingData) {
  requireAuth(token);
  // This function doesn't need to do much server-side processing
  // The main purpose is to acknowledge the change and potentially
  // trigger any server-side cache updates if needed
  
  // Could trigger any server-side updates here if needed
  // For now, just acknowledge the change
  return { status: 'success', message: 'Sync indicators updated' };
}

function updateDriveLink(token, jiraId, driveLink, targetUsername) {
  const auth = requireAuth(token);
  const contextUser = resolveDataContextUser(auth.user, targetUsername);
  return updateDriveLink_(jiraId, driveLink, contextUser);
}

// --- User Management API ---

function getUsersList(token) {
  const auth = requireAuth(token);
  if (auth.role !== 'admin') {
    throw new Error("Access denied: Admin rights required.");
  }
  return getUsers();
}

function getWorkspaceOwners(token) {
  const auth = requireAuth(token);
  // Allow all authenticated users to see the list of workspace owners
  const allUsers = getUsers();
  // Filter for Admins and Project Managers (Case Insensitive)
  return allUsers.filter(u => {
    const r = String(u.role || '').toLowerCase().replace(/\s+/g, '_');
    return (r === 'admin' || r === 'project_manager') && u.isActive !== false;
  }).map(u => ({ username: u.username, displayName: u.displayName }));
}

function saveUser(token, user) {
  const auth = requireAuth(token);
  if (auth.role !== 'admin') {
    throw new Error("Access denied: Admin rights required.");
  }
  
  if (user.id) {
    // Update existing
    return updateUser(user.id, user);
  } else {
    // Create new
    return createUser(user);
  }
}

function deleteUser(token, userId) {
  const auth = requireAuth(token);
  if (auth.role !== 'admin') {
    throw new Error("Access denied: Admin rights required.");
  }
    // Soft delete by setting isActive = false
  return updateUser(userId, { isActive: false });
}

function impersonateUser(token, targetUserId) {
  // Auth check is inside the implementation to verify admin status
  return impersonateUser_(token, targetUserId);
}

function runDatabaseMaintenance(token, targetSheetId) {
  const auth = requireAuth(token);
  if (auth.role !== 'admin') {
    throw new Error("Access denied: Admin rights required.");
  }
  
  let targetSS = null;
  if (targetSheetId) {
    try {
      targetSS = SpreadsheetApp.openById(targetSheetId);
    } catch (e) {
      return { success: false, message: 'Could not open spreadsheet with ID: ' + targetSheetId };
    }
  }
  
  const logs = setupSheets(targetSS);
  return { success: true, logs: logs };
}