/**
 * @file Constants.js
 * @description Stores global constants and configuration for the application.
 */

// --- WORKBOOK CONFIGURATION (worksheet names) ---
const JIRA_DATA_SHEET = "JiraData";
const MANUAL_DATA_SHEET = "ManualData";
const CONFIG_SHEET = "OptionsList";
const INDEPENDENT_TASKS_SHEET = "IndependentTasks";
const USERS_SHEET = "Users";
const SESSIONS_SHEET = "Sessions";
const ADMIN_CONFIGS_SHEET = "AdminConfigs";

// --- INTEGRATIONS ---
// Google Tasks and Google Drive are disabled in the browser-only build.
// Planned Microsoft replacements: Microsoft To Do (tasks) and OneDrive/SharePoint (project folders).
const INTEGRATIONS_DISABLED_MESSAGE = 'This integration is not available in the browser-only version yet.';
