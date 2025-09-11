/**
 * @file Main.gs
 * @description Main entry point and API router for the web app.
 */

function doGet(e) {
  var template;
  if (e.parameter.page === 'config') {
    template = HtmlService.createTemplateFromFile('Config.html');
  } else if (e.parameter.page === 'tasks') { // NEW: Handle the tasks page
    template = HtmlService.createTemplateFromFile('Tasks.html');
  } else {
    template = HtmlService.createTemplateFromFile('Dashboard.html');
  }
  template.url = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle("Project Tracker Dashboard")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- Client-Callable API Functions ---
function forceGetProjectData() {
  return forceGetProjectData_();
}

function getProjectData() {
  return getProjectData_();
}

function importJiraCsv(csvData) {
  return importJiraCsv_(csvData);
}

function importJiraFile(fileData) {
  return importJiraCsv_(fileData);
}

function saveConfiguration(optionsData) {
  return saveConfiguration_(optionsData);
}

function saveManualData(jiraId, field, value) {
  return saveManualData_(jiraId, field, value);
}

function saveIndependentTask(taskData) {
  return saveIndependentTask_(taskData);
}

function updateLastChecked(jiraId) {
  return updateLastChecked_(jiraId);
}

function updateSyncIndicators(mappingData) {
  // This function doesn't need to do much server-side processing
  // The main purpose is to acknowledge the change and potentially
  // trigger any server-side cache updates if needed
  
  // Could trigger any server-side updates here if needed
  // For now, just acknowledge the change
  return { status: 'success', message: 'Sync indicators updated' };
}