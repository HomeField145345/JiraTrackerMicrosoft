/**
 * @file Main.gs
 * @description Main entry point and API router for the web app.
 */

function doGet(e) {
  var template;
  
  // Simple routing
  if (e.parameter.page === 'config') {
    template = HtmlService.createTemplateFromFile('Config.html');
  } else if (e.parameter.page === 'tasks') {
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
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

// --- Client-Callable API Functions ---

function requireAuth(token) {
  const auth = validateSession(token);
  if (!auth.valid) {
    throw new Error("Authentication failed: " + (auth.reason || "Invalid token"));
  }
  return auth;
}

function forceGetProjectData(token) {
  requireAuth(token);
  return forceGetProjectData_();
}

function getProjectData(token) {
  requireAuth(token);
  return getProjectData_();
}

function importJiraCsv(token, csvData) {
  requireAuth(token);
  return importJiraCsv_(csvData);
}

function importJiraFile(token, fileData) {
  requireAuth(token);
  return importJiraCsv_(fileData);
}

function saveConfiguration(token, optionsData) {
  requireAuth(token);
  return saveConfiguration_(optionsData);
}

function saveManualData(token, jiraId, field, value) {
  requireAuth(token);
  return saveManualData_(jiraId, field, value);
}

function saveIndependentTask(token, taskData) {
  requireAuth(token);
  return saveIndependentTask_(taskData);
}

function updateLastChecked(token, jiraId) {
  requireAuth(token);
  return updateLastChecked_(jiraId);
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

function updateDriveLink(token, jiraId, driveLink) {
  requireAuth(token);
  return updateDriveLink_(jiraId, driveLink);
}

// --- User Management API ---

function getUsersList(token) {
  const auth = requireAuth(token);
  if (auth.role !== 'admin') {
    throw new Error("Access denied: Admin rights required.");
  }
  return getUsers();
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