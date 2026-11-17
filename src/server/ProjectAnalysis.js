/**
 * @file ProjectAnalysis.js
 * @description Core project data analysis and aggregation functionality.
 * 
 * This module handles:
 * - Main project data retrieval and caching
 * - Configuration loading from sheets
 * - Data aggregation from multiple sources (Jira, Manual, Independent Tasks)
 * - Sprint analysis and statistics
 * - Forced data refresh operations
 * 
 * Dependencies:
 * - Constants.js (sheet names)
 * - CacheManager.js (setCacheInChunks, getCacheInChunks, clearProjectCache, logTimestampOperation)
 * - SheetOperations.js (getSheetOrThrow, readJiraData, readManualData, readIndependentTasks, analyzeSprintData)
 */

/**
 * Main function to get aggregated project data with caching
 * @param {Object} user - The user requesting the data
 * @param {string} [targetUsername] - Optional username to view data for (if allowed)
 * @returns {Object} Complete project data including projects, config, and sprint stats
 */
function getProjectData_(user, targetUsername) {
  // Determine the Context User (The owner of the data we want to see)
  let contextUser = user;
  
  // Ensure we have the full user object (including dataSheetId)
  // The 'user' passed from auth might be minimal {id, username, role}
  if (!contextUser.dataSheetId && contextUser.id) {
      const fullUser = getUserById(contextUser.id);
      if (fullUser) {
          contextUser = fullUser;
      }
  }
  
  // If a target is specified, use it.
  // This allows QA/View Only users to view PM/Admin workspaces.
  if (targetUsername && (!contextUser || contextUser.username !== targetUsername)) {
    // We need the full user object to get the dataSheetId
    // We can't just use the username string anymore.
    const users = getUsers();
    const target = users.find(u => u.username === targetUsername);
    if (target) {
        contextUser = target;
    }
  }

  var data = _getRawProjectData(contextUser);
  
  if (data.error) return data;
  
  // Determine which user to filter by
  // Default to the logged-in user (or the target if specified)
  var filterUser = contextUser.username;
  
  // Filter data based on user ownership
  // SKIP FILTERING if:
  // 1. The user is an Admin
  // 2. We are looking at a personal spreadsheet (dataSheetId is present) - assume all data in personal sheet is relevant
  var shouldFilter = true;
  if (user.role === 'admin') shouldFilter = false;
  if (contextUser.dataSheetId) shouldFilter = false;

  if (filterUser && shouldFilter) {
    var initialCount = data.projects.length;

    // Check if 'Owner' field exists in the data (check first few items)
    var hasOwnerField = data.projects.some(function(p) { return p.hasOwnProperty('Owner'); });
    
    // Check if ANY item has a non-empty Owner value
    var hasAnyOwnerValue = data.projects.some(function(p) { return p.Owner && String(p.Owner).trim() !== ''; });
    
    if ((!hasOwnerField || !hasAnyOwnerValue) && data.projects.length > 0) {
        // Do not filter projects if Owner field is missing or unused
    } else {
        // Filter projects: include ONLY if owner matches (supports multiple owners comma-separated)
        data.projects = data.projects.filter(function(p) {
          if (!p.Owner) return false;
          var owners = String(p.Owner).split(',').map(function(s) { return s.trim(); });
          return owners.indexOf(filterUser) !== -1;
        });
    }
    
    // Filter independent tasks: include ONLY if owner matches
    // Independent tasks might have different structure, check for Owner there too
    var hasTaskOwner = data.independentTasks.some(function(t) { return t.hasOwnProperty('Owner'); });
    var hasAnyTaskOwnerValue = data.independentTasks.some(function(t) { return t.Owner && String(t.Owner).trim() !== ''; });
    
    if ((!hasTaskOwner || !hasAnyTaskOwnerValue) && data.independentTasks.length > 0) {
         // Owner field missing or empty in independent tasks, skipping filtering
    } else {
        data.independentTasks = data.independentTasks.filter(function(t) {
          if (!t.Owner) return false;
          var owners = String(t.Owner).split(',').map(function(s) { return s.trim(); });
          return owners.indexOf(filterUser) !== -1;
        });
    }
    
    // Re-analyze sprint stats based on filtered data
    var allItems = data.projects.concat(data.independentTasks);
    data.sprintStats = analyzeSprintData(allItems);
  } else {
    // Skipping ownership filtering
  }
  
  return data;
}

/**
 * Internal function to get raw aggregated project data with caching (unfiltered)
 * @private
 * @param {Object} contextUser - The user whose dataset we are accessing
 * @returns {Object} Complete project data
 */
function _getRawProjectData(contextUser) {
  try {
    // Check cache first (Cache is scoped to the context user)
    var cache = Platform.cache();
    var cacheKey = 'project_data_' + (contextUser ? contextUser.username : 'global');
    var cachedData = getCacheInChunks(cache, cacheKey);
    if (cachedData) {
      var parsed = JSON.parse(cachedData);
      // Validate cached data structure
      if (parsed && parsed.projects && parsed.independentTasks && parsed.config) {
        return parsed;
      }
      // If invalid, ignore cache and fetch fresh
    }

    // Data comes from the User's specific spreadsheet (or global fallback)
    var dataSS;
    if (contextUser && contextUser.dataSheetId && String(contextUser.dataSheetId).trim() !== '') {
       try {
         dataSS = WorkbookService.openById(contextUser.dataSheetId);
       } catch (e) {
         dataSS = WorkbookService.getActiveWorkbook();
       }
    } else {
       dataSS = WorkbookService.getActiveWorkbook();
    }

    var jiraSheet = getSheetOrThrow(dataSS, JIRA_DATA_SHEET);

    var manualDataSheet = getSheetOrThrow(dataSS, MANUAL_DATA_SHEET);
    var independentTasksSheet = getSheetOrThrow(dataSS, INDEPENDENT_TASKS_SHEET);
    
    // Config always comes from the Global Master Spreadsheet
    var globalSS = WorkbookService.getActiveWorkbook();
    var configSheet = getSheetOrThrow(globalSS, CONFIG_SHEET);
    
    // Load configuration options from sheets
    var config = _loadConfigurationCached(configSheet);
    
    // Load all data sources
    var projects = readJiraData(jiraSheet) || [];

    var manualDataMap = readManualData(manualDataSheet) || {};
    var independentTasks = readIndependentTasks(independentTasksSheet) || [];
    var users = getUsers() || [];
    
    // Combine Jira data with manual overrides
    var combinedProjects = _combineProjectData(projects, manualDataMap);
    
    // Analyze sprint data
    var allItems = combinedProjects.concat(independentTasks);
    var sprintStats = analyzeSprintData(allItems);
    
    var finalData = { 
      projects: combinedProjects, 
      independentTasks: independentTasks, 
      config: config || {},
      sprintStats: sprintStats,
      users: users
    };
    
    // Log timestamp samples for debugging
    _logTimestampSamples(combinedProjects);
    
    // Cache the results
    setCacheInChunks(cache, cacheKey, JSON.stringify(finalData), 600);
    return finalData;

  } catch (e) {
    // Return a structured error object so the client doesn't crash
    return { error: true, message: e.toString(), stack: e.stack };
  }
}

/**
 * Force refresh project data by clearing cache
 * @param {Object} user - The user requesting the data
 * @param {string} [targetUsername] - Optional workspace username to refresh
 * @returns {Object} Fresh project data
 */
function forceGetProjectData_(user, targetUsername) {
  var usernameToClear = null;
  if (targetUsername && String(targetUsername).trim() !== '') {
    usernameToClear = String(targetUsername).trim();
  } else if (user && user.username) {
    usernameToClear = user.username;
  }

  clearProjectCache(usernameToClear);
  return getProjectData_(user, targetUsername);
}

/**
 * Load configuration from the config sheet
 * @private
 * @param {Worksheet} configSheet - The configuration sheet
 * @returns {Object} Configuration object with all options and settings
 */
function _loadConfiguration(configSheet) {
  var lastRow = configSheet.getLastRow();
  var values = lastRow > 1 ? configSheet.getRange(2, 1, lastRow - 1, 18).getValues() : [];

  function getColumnValues(columnIndex) {
    var result = [];
    for (var rowIndex = 0; rowIndex < values.length; rowIndex++) {
      var value = values[rowIndex][columnIndex];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        result.push(String(value).trim());
      }
    }
    return result;
  }

  function parseLegacyJson(columnIndex) {
    if (!values.length) return [];
    var rawValue = values[0][columnIndex];
    if (!rawValue || typeof rawValue !== 'string') return [];

    try {
      var parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  var actPctOptions = getColumnValues(0);
  var planningStageOptions = getColumnValues(1);
  var projectStageOptions = getColumnValues(2);
  var epicProjectStageOptions = getColumnValues(4);
  var storyProjectStageOptions = getColumnValues(5);
  var bugProjectStageOptions = getColumnValues(6);
  var priorityOptions = getColumnValues(12);
  var pastDueExemptStages = getColumnValues(14);
  var kpiProjectStages = getColumnValues(15);
  var independentTaskStatusOptions = getColumnValues(16);
  var inProgressStatuses = getColumnValues(17);

  var helpfulLinks = [];
  for (var helpfulIndex = 0; helpfulIndex < values.length; helpfulIndex++) {
    var helpfulCell = values[helpfulIndex][3];
    if (!helpfulCell) continue;

    try {
      var parsedLink = JSON.parse(helpfulCell);
      if (Array.isArray(parsedLink)) {
        helpfulLinks = helpfulLinks.concat(parsedLink);
      } else if (parsedLink && typeof parsedLink === 'object') {
        helpfulLinks.push(parsedLink);
      }
    } catch (e) {
      helpfulLinks.push({ title: helpfulCell, url: helpfulCell });
    }
  }

  var closedProjectStages = getColumnValues(7);
  if (closedProjectStages.length === 0) {
    closedProjectStages = parseLegacyJson(7);
  }

  var closedStatuses = getColumnValues(8);
  if (closedStatuses.length === 0) {
    closedStatuses = parseLegacyJson(8);
  }

  var pastSprintClosedStages = getColumnValues(11);

  var stageStatusMappings = [];
  for (var mappingIndex = 0; mappingIndex < values.length; mappingIndex++) {
    var stageValue = String(values[mappingIndex][9] || '').trim();
    var statusValue = String(values[mappingIndex][10] || '').trim();

    if (stageValue) {
      stageStatusMappings.push({
        stage: stageValue,
        expectedStatuses: statusValue ? statusValue.split(',').map(function(s) { return s.trim(); }).filter(String) : []
      });
    }
  }

  if (stageStatusMappings.length === 0) {
    var legacyMappings = parseLegacyJson(9);
    if (legacyMappings.length > 0) {
      stageStatusMappings = legacyMappings.map(function(mapping) {
        return {
          stage: mapping.stage,
          expectedStatuses: mapping.keywords || mapping.expectedStatuses || []
        };
      });
    }
  }
  
  return { 
    actPctOptions: actPctOptions,
    planningStageOptions: planningStageOptions,
    projectStageOptions: projectStageOptions,
    kpiProjectStages: kpiProjectStages,
    independentTaskStatusOptions: independentTaskStatusOptions,
    epicProjectStageOptions: epicProjectStageOptions,
    storyProjectStageOptions: storyProjectStageOptions,
    bugProjectStageOptions: bugProjectStageOptions,
    priorityOptions: priorityOptions,
    helpfulLinks: helpfulLinks,
    closedProjectStages: closedProjectStages,
    closedStatuses: closedStatuses, // Kept for backward compatibility; not used for sync
    stageStatusMappings: stageStatusMappings,
    pastSprintClosedStages: pastSprintClosedStages,
    pastDueExemptStages: pastDueExemptStages,
    inProgressStatuses: inProgressStatuses,
    notInProgressStatuses: inProgressStatuses
  };
}

function _loadConfigurationCached(configSheet) {
  var cache = Platform.cache();
  var cachedConfig = cache.get(CONFIG_CACHE_KEY);
  if (cachedConfig) {
    try {
      var parsedConfig = JSON.parse(cachedConfig);
      if (parsedConfig && typeof parsedConfig === 'object') {
        return parsedConfig;
      }
    } catch (e) {
      // Fall through to rebuild cache
    }
  }

  var config = _loadConfiguration(configSheet);
  try {
    cache.put(CONFIG_CACHE_KEY, JSON.stringify(config), CONFIG_CACHE_TTL_SECONDS);
  } catch (e) {
    // Ignore cache write failures
  }
  return config;
}

/**
 * Combine Jira project data with manual overrides
 * @private
 * @param {Array<Object>} projects - Jira project data
 * @param {Object} manualDataMap - Manual data overrides indexed by Jira ID
 * @returns {Array<Object>} Combined project data
 */
function _combineProjectData(projects, manualDataMap) {
  return projects.map(function(p) {
    var jiraId = String(p['Jira #']);
    var manualData = manualDataMap[jiraId] || {};
    
    var combined = {};
    
    // Start with Jira data
    for (var key in p) {
      if (p.hasOwnProperty(key)) combined[key] = p[key];
    }
    
    // Override with manual data where present
    for (var keyManual in manualData) {
      if (manualData.hasOwnProperty(keyManual)) combined[keyManual] = manualData[keyManual];
    }
    
    return combined;
  });
}

/**
 * Log timestamp samples for debugging purposes
 * @private
 * @param {Array<Object>} combinedProjects - Combined project data
 */
function _logTimestampSamples(combinedProjects) {
  try {
    // Sample a few records with timestamps for logging
    var timestampSamples = [];
    for (var i = 0; i < Math.min(5, combinedProjects.length); i++) {
      var project = combinedProjects[i];
      if (project["Updated"] || project["Last Checked"]) {
        timestampSamples.push({
          jiraId: project["Jira #"],
          updated: project["Updated"],
          lastChecked: project["Last Checked"],
          updatedType: project["Updated"] === null ? 'null' : typeof project["Updated"],
          lastCheckedType: project["Last Checked"] === null ? 'null' : typeof project["Last Checked"],
          projectStage: project["Project Stage"]
        });
      }
    }
    
    logTimestampOperation("Project Data Sample (Before Client Return)", {
      sampleCount: timestampSamples.length,
      samples: timestampSamples,
      scriptTimeZone: Platform.timeZone(),
      currentServerTime: new Date().toISOString()
    });
  } catch (logError) {
    // Don't let logging errors affect the main operation
  }
}

/**
 * Get configuration data for the config page
 * @param {Object} user - The user requesting the data
 * @returns {Object} Configuration data
 */
function getConfigData_(user) {
  try {
    var ss = WorkbookService.getActiveWorkbook();
    var configSheet = getSheetOrThrow(ss, CONFIG_SHEET);
    var config = _loadConfiguration(configSheet);
    return { config: config };
  } catch (e) {
    return { error: true, message: e.toString() };
  }
}
