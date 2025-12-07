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
  var data = _getRawProjectData();
  
  if (data.error) return data;
  
  // Determine which user to filter by
  // Default to the logged-in user
  var filterUser = user.username;
  
  // If we have a userId, fetch the latest username from the database
  // This ensures that if the username was changed, we use the new one
  if (user.id) {
      var freshUser = getUserById(user.id);
      if (freshUser) {
          filterUser = freshUser.username;
      }
  }
  
  // If a target is specified, use it.
  // This allows QA/View Only users to view PM/Admin workspaces.
  if (targetUsername) {
    filterUser = targetUsername;
  }
  
  // Filter data based on user ownership
  if (filterUser) {
    // Filter projects: include ONLY if owner matches (supports multiple owners comma-separated)
    data.projects = data.projects.filter(function(p) {
      if (!p.Owner) return false;
      var owners = String(p.Owner).split(',').map(function(s) { return s.trim(); });
      return owners.indexOf(filterUser) !== -1;
    });
    
    // Filter independent tasks: include ONLY if owner matches
    data.independentTasks = data.independentTasks.filter(function(t) {
      if (!t.Owner) return false;
      var owners = String(t.Owner).split(',').map(function(s) { return s.trim(); });
      return owners.indexOf(filterUser) !== -1;
    });
    
    // Re-analyze sprint stats based on filtered data
    var allItems = data.projects.concat(data.independentTasks);
    data.sprintStats = analyzeSprintData(allItems);
  }
  
  return data;
}

/**
 * Internal function to get raw aggregated project data with caching (unfiltered)
 * @private
 * @returns {Object} Complete project data
 */
function _getRawProjectData() {
  try {
    // Check cache first
    var cache = CacheService.getScriptCache();
    var cacheKey = 'project_data';
    var cachedData = getCacheInChunks(cache, cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var jiraSheet = getSheetOrThrow(ss, JIRA_DATA_SHEET);
    var manualDataSheet = getSheetOrThrow(ss, MANUAL_DATA_SHEET);
    var configSheet = getSheetOrThrow(ss, CONFIG_SHEET);
    var independentTasksSheet = getSheetOrThrow(ss, INDEPENDENT_TASKS_SHEET);
    
    // Load configuration options from sheets
    var config = _loadConfiguration(configSheet);
    
    // Load all data sources
    var projects = readJiraData(jiraSheet);
    var manualDataMap = readManualData(manualDataSheet);
    var independentTasks = readIndependentTasks(independentTasksSheet);
    var users = getUsers();
    
    // Combine Jira data with manual overrides
    var combinedProjects = _combineProjectData(projects, manualDataMap);
    
    // Analyze sprint data
    var allItems = combinedProjects.concat(independentTasks);
    var sprintStats = analyzeSprintData(allItems);
    
    var finalData = { 
      projects: combinedProjects, 
      independentTasks: independentTasks, 
      config: config,
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
 * @returns {Object} Fresh project data
 */
function forceGetProjectData_(user) {
  clearProjectCache();
  return getProjectData_(user);
}

/**
 * Load configuration from the config sheet
 * @private
 * @param {SpreadsheetApp.Sheet} configSheet - The configuration sheet
 * @returns {Object} Configuration object with all options and settings
 */
function _loadConfiguration(configSheet) {
  var flatten = function(arr) { 
    return arr.reduce(function(acc, val) { 
      return acc.concat(val); 
    }, []); 
  };
  
  // Load basic configuration options
  var actPctOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("A2:A" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var planningStageOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("B2:B" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var projectStageOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("C2:C" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var kpiProjectStages = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("P2:P" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var independentTaskStatusOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("Q2:Q" + configSheet.getLastRow()).getValues()).filter(String) : [];
  
  // Per-type project stage options (optional)
  var epicProjectStageOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("E2:E" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var storyProjectStageOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("F2:F" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var bugProjectStageOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("G2:G" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var priorityOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("M2:M" + configSheet.getLastRow()).getValues()).filter(String) : [];
  
  // Load complex configuration (JSON and mappings)
  var helpfulLinks = _loadHelpfulLinks(configSheet);
  var closedProjectStages = _loadClosedProjectStages(configSheet);
  var closedStatuses = _loadClosedStatuses(configSheet);
  var pastSprintClosedStages = _loadPastSprintClosedStages(configSheet);
  var pastDueExemptStages = _loadPastDueExemptStages(configSheet);
  var stageStatusMappings = _loadStageStatusMappings(configSheet);
  
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
    pastDueExemptStages: pastDueExemptStages
  };
}

/**
 * Load helpful links from configuration
 * @private
 */
function _loadHelpfulLinks(configSheet) {
  var helpfulLinks = [];
  if (configSheet.getLastRow() > 1) {
    try {
      var values = configSheet.getRange("D2:D" + configSheet.getLastRow()).getValues();
      values.forEach(function(row) {
        var cellValue = row[0];
        if (cellValue) {
          try {
            var parsed = JSON.parse(cellValue);
            if (Array.isArray(parsed)) {
              // Handle legacy format where D2 contained the entire array
              helpfulLinks = helpfulLinks.concat(parsed);
            } else if (typeof parsed === 'object') {
              // Handle new format where each row is a link object
              helpfulLinks.push(parsed);
            }
          } catch (e) {
            // Handle plain text (fallback)
            helpfulLinks.push({ title: cellValue, url: cellValue });
          }
        }
      });
    } catch (e) {
      console.error("Error loading helpful links: " + e);
    }
  }
  return helpfulLinks;
}

/**
 * Load closed project stages configuration
 * @private
 */
function _loadClosedProjectStages(configSheet) {
  var closedProjectStages = [];
  
  // Prefer multi-row lists in column H
  if (configSheet.getLastRow() > 1) {
    try {
      var flatten = function(arr) { return arr.reduce(function(acc, val) { return acc.concat(val); }, []); };
      closedProjectStages = flatten(configSheet.getRange("H2:H" + configSheet.getLastRow()).getValues()).filter(String);
    } catch (e) {
      // Fallback handled below
    }
  }
  
  // Fallback to legacy JSON (single cell) if lists are empty
  if (!closedProjectStages || closedProjectStages.length === 0) {
    try {
      var legacyClosedStages = configSheet.getRange("H2").getValue();
      if (legacyClosedStages && typeof legacyClosedStages === 'string') {
        closedProjectStages = JSON.parse(legacyClosedStages) || [];
      }
    } catch (e) {
      closedProjectStages = [];
    }
  }
  
  return closedProjectStages;
}

/**
 * Load closed statuses configuration (deprecated but kept for compatibility)
 * @private
 */
function _loadClosedStatuses(configSheet) {
  var closedStatuses = [];
  
  if (configSheet.getLastRow() > 1) {
    try {
      var flatten = function(arr) { return arr.reduce(function(acc, val) { return acc.concat(val); }, []); };
      closedStatuses = flatten(configSheet.getRange("I2:I" + configSheet.getLastRow()).getValues()).filter(String);
    } catch (e) {
      // Fallback handled below
    }
  }
  
  // Legacy closedStatuses JSON fallback retained but not used by sync logic
  if (!closedStatuses || closedStatuses.length === 0) {
    try {
      var legacyClosedStatuses = configSheet.getRange("I2").getValue();
      if (legacyClosedStatuses && typeof legacyClosedStatuses === 'string') {
        closedStatuses = JSON.parse(legacyClosedStatuses) || [];
      }
    } catch (e) {
      closedStatuses = [];
    }
  }
  
  return closedStatuses;
}

/**
 * Load past sprint closed stages configuration
 * @private
 */
function _loadPastSprintClosedStages(configSheet) {
  var pastSprintClosedStages = [];
  
  if (configSheet.getLastRow() > 1) {
    try {
      var flatten = function(arr) { return arr.reduce(function(acc, val) { return acc.concat(val); }, []); };
      pastSprintClosedStages = flatten(configSheet.getRange("L2:L" + configSheet.getLastRow()).getValues()).filter(String);
    } catch (e) {
      pastSprintClosedStages = [];
    }
  }
  
  return pastSprintClosedStages;
}

/**
 * Load past due exempt stages configuration
 * @private
 */
function _loadPastDueExemptStages(configSheet) {
  var pastDueExemptStages = [];
  
  if (configSheet.getLastRow() > 1) {
    try {
      var flatten = function(arr) { return arr.reduce(function(acc, val) { return acc.concat(val); }, []); };
      pastDueExemptStages = flatten(configSheet.getRange("O2:O" + configSheet.getLastRow()).getValues()).filter(String);
    } catch (e) {
      pastDueExemptStages = [];
    }
  }
  
  return pastDueExemptStages;
}

/**
 * Load stage-status mappings configuration
 * @private
 */
function _loadStageStatusMappings(configSheet) {
  var stageStatusMappings = [];
  
  if (configSheet.getLastRow() > 1) {
    try {
      // Read stage↔status pairs: J = Project Stage, K = comma-separated expected statuses
      var lastRow = configSheet.getLastRow();
      var stageVals = configSheet.getRange(2, 10, lastRow - 1, 1).getValues(); // J
      var statusVals = configSheet.getRange(2, 11, lastRow - 1, 1).getValues(); // K
      
      for (var idx = 0; idx < stageVals.length; idx++) {
        var stg = String(stageVals[idx][0] || '').trim();
        var statusStr = String(statusVals[idx][0] || '').trim();
        if (stg) {
          var expectedStatuses = statusStr ? statusStr.split(',').map(function(s){ return s.trim(); }).filter(String) : [];
          stageStatusMappings.push({ stage: stg, expectedStatuses: expectedStatuses });
        }
      }
    } catch (e) {
      // Fallback handled below
    }
  }
  
  // Stage↔Status legacy JSON fallback (J2 contains JSON array of {stage,expectedStatuses})
  if (stageStatusMappings.length === 0) {
    try {
      var legacyMappings = configSheet.getRange("J2").getValue();
      if (legacyMappings && typeof legacyMappings === 'string') {
        var parsed = JSON.parse(legacyMappings);
        if (Array.isArray(parsed)) {
          // Convert old format {stage, keywords} to new format {stage, expectedStatuses}
          stageStatusMappings = parsed.map(function(m) {
            return {
              stage: m.stage,
              expectedStatuses: m.keywords || m.expectedStatuses || []
            };
          });
        }
      }
    } catch (e) {
      // Use empty array as final fallback
    }
  }
  
  return stageStatusMappings;
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
          projectStage: project["Project Stage"]
        });
      }
    }
    
    logTimestampOperation("Project Data Sample (Before Client Return)", {
      sampleCount: timestampSamples.length,
      samples: timestampSamples,
      scriptTimeZone: Session.getScriptTimeZone(),
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var configSheet = getSheetOrThrow(ss, CONFIG_SHEET);
    var config = _loadConfiguration(configSheet);
    return { config: config };
  } catch (e) {
    return { error: true, message: e.toString() };
  }
}
