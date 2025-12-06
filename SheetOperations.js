/**
 * @file SheetOperations.js
 * @description Sheet reading and data extraction operations for Google Sheets.
 * 
 * This module handles all Google Sheets operations including:
 * - Reading Jira data from sheets
 * - Reading manual data overrides
 * - Reading independent tasks
 * - Utility functions for sheet operations
 * 
 * Dependencies:
 * - DataUtilities.js (normalizeValue_, parseUtcTimestampString_)
 * - CacheManager.js (logTimestampOperation)
 * - SprintUtilities.js (parseSprintDates)
 */

/**
 * Get a sheet by name, throwing an error if not found
 * @param {SpreadsheetApp.Spreadsheet} ss - The spreadsheet
 * @param {string} sheetName - Name of the sheet to get
 * @returns {SpreadsheetApp.Sheet} The requested sheet
 * @throws {Error} If the sheet is not found
 */
function getSheetOrThrow(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Required sheet '" + sheetName + "' was not found.");
  return sheet;
}

/**
 * Read and process Jira data from a sheet
 * @param {SpreadsheetApp.Sheet} sheet - The sheet containing Jira data
 * @returns {Array<Object>} Array of project objects with normalized data
 */
function readJiraData(sheet) {
  var projects = []; 
  if (sheet.getLastRow() > 1) { 
    var numRows = sheet.getLastRow() - 1;
    var numCols = sheet.getLastColumn();
    var jiraDataValues = sheet.getRange(2, 1, numRows, numCols).getValues(); 
    // Also read display strings so we can treat certain columns as raw UTC text
    var jiraDisplayValues = sheet.getRange(2, 1, numRows, numCols).getDisplayValues();
    var jiraHeaders = sheet.getRange(1, 1, 1, numCols).getValues()[0]; 
    
    for (var i = 0; i < jiraDataValues.length; i++) { 
      var row = jiraDataValues[i]; 
      var rowDisplay = jiraDisplayValues[i];
      var project = {}; 
      
      for (var j = 0; j < jiraHeaders.length; j++) { 
        var header = jiraHeaders[j]; 
        var cellValue = row[j];
        var displayValue = rowDisplay[j];
        
        // Log timestamp data extraction specifically for "Updated" and "Last Checked" columns
        if ((header === "Updated" || header === "Last Checked") && cellValue) {
          var isDate = cellValue instanceof Date;
          var logDetails = {
            column: header,
            rowIndex: i + 2,
            valueType: typeof cellValue,
            isDateObject: isDate
          };
          
          if (header === "Updated") {
            // Treat Updated as RAW UTC components regardless of sheet timezone.
            var usedIso = null;
            var method = null;
            var disp = (displayValue != null) ? String(displayValue).trim() : "";
            logDetails.displayValue = disp;
            // 1) Try strict UTC parser on the display text
            var parsedIso = disp ? parseUtcTimestampString_(disp) : null;
            if (parsedIso) {
              usedIso = parsedIso;
              method = "display_parse_utc";
            } else if (isDate) {
              // 2) Fallback: preserve components as UTC (no timezone shift)
              var y = cellValue.getFullYear();
              var mo = cellValue.getMonth();
              var d = cellValue.getDate();
              var h = cellValue.getHours();
              var mi = cellValue.getMinutes();
              var s = cellValue.getSeconds();
              var ms = cellValue.getMilliseconds();
              usedIso = new Date(Date.UTC(y, mo, d, h, mi, s, ms)).toISOString();
              method = "date_components_to_utc";
            } else {
              // 3) Last resort: normalize string then parse as UTC
              var strVal = String(cellValue).trim();
              var norm = normalizeValue_(strVal);
              var parsed2 = parseUtcTimestampString_(norm);
              usedIso = parsed2 || norm;
              method = "normalize_then_parse";
            }
            project[header] = usedIso;
            logDetails.usedIso = usedIso;
            logDetails.method = method;
            logDetails.correctionApplied = true;
            logDetails.correctionExplanation = "Updated treated as UTC regardless of sheet timezone";
          } else {
            // Last Checked: keep true instant; emit canonical UTC ISO
            if (isDate) {
              var iso = cellValue.toISOString();
              project[header] = iso;
              logDetails.isoString = iso;
              logDetails.epochMillis = cellValue.getTime();
              logDetails.scriptTimeZone = Session.getScriptTimeZone && Session.getScriptTimeZone();
              logDetails.correctionApplied = false;
            } else {
              var strValLC = String(cellValue).trim();
              logDetails.originalString = strValLC;
              var parsedIsoLC = parseUtcTimestampString_(strValLC);
              if (parsedIsoLC) {
                project[header] = parsedIsoLC;
                logDetails.parsedIso = parsedIsoLC;
                logDetails.correctionApplied = true;
                logDetails.correctionExplanation = "Parsed string as UTC using custom parser";
              } else {
                var normalizedValueLC = normalizeValue_(strValLC);
                project[header] = normalizedValueLC;
                logDetails.normalizedValue = normalizedValueLC;
                logDetails.correctionApplied = true;
                logDetails.correctionExplanation = "Fallback normalizeValue_ used";
              }
            }
          }
          
          logTimestampOperation("Sheet Data Extraction", logDetails);
        } else {
          // For non-timestamp columns, just do the standard conversion
          project[header] = cellValue instanceof Date ? cellValue.toISOString() : cellValue;
        }
      } 
      
      projects.push(project); 
    } 
  } 
  return projects;
}

/**
 * Read manual data overrides from the ManualData sheet
 * @param {SpreadsheetApp.Sheet} manualDataSheet - The manual data sheet
 * @returns {Object} Map of Jira IDs to manual data overrides
 */
function readManualData(manualDataSheet) {
  var manualDataMap = {};
  if (manualDataSheet.getLastRow() >= 2) {
    var manualDataValues = manualDataSheet.getRange(2, 1, manualDataSheet.getLastRow() - 1, 9).getValues();
    
    for (var i = 0; i < manualDataValues.length; i++) {
      var row = manualDataValues[i];
      if (row[0]) {
        var key = String(row[0]);
        var parseDate = function(dateValue) {
          if (dateValue instanceof Date) {
            return dateValue.toISOString();
          }
          return null;
        };
        manualDataMap[key] = {
          'ACT/PCT': row[1],
          'Planning Stage': row[2],
          'Project Stage': row[3],
          'Last Checked': parseDate(row[4]),
          'Start Date': parseDate(row[5]),
          'End Date': parseDate(row[6]),
          'Drive Link': row[7],
          'Priority': row[8]
        };
      }
    }
  }
  
  return manualDataMap;
}

/**
 * Read independent tasks from the IndependentTasks sheet
 * @param {SpreadsheetApp.Sheet} independentTasksSheet - The independent tasks sheet
 * @returns {Array<Object>} Array of independent task objects
 */
function readIndependentTasks(independentTasksSheet) {
  var independentTasks = [];
  if (independentTasksSheet.getLastRow() >= 2) {
    var numRows = independentTasksSheet.getLastRow() - 1;
    var numCols = independentTasksSheet.getLastColumn();
    var dataValues = independentTasksSheet.getRange(2, 1, numRows, numCols).getValues();
    var headers = independentTasksSheet.getRange(1, 1, 1, numCols).getValues()[0];
    
    for (var i = 0; i < dataValues.length; i++) {
      var row = dataValues[i];
      // Use ID or Title as the check for existence
      var idIndex = headers.indexOf('ID');
      var titleIndex = headers.indexOf('Title');
      
      if ((idIndex > -1 && row[idIndex]) || (titleIndex > -1 && row[titleIndex])) {
        var task = {};
        for (var j = 0; j < headers.length; j++) {
          var header = headers[j];
          var value = row[j];
          
          // Handle dates
          if (header === 'Due' || header === 'Start Date' || header === 'End Date') {
             if (value instanceof Date) {
               task[header] = value.toISOString();
             } else {
               task[header] = value;
             }
          } else {
            task[header] = value;
          }
        }
        
        // Map legacy fields if needed or ensure standard fields exist
        if (!task['Task Name'] && task['Title']) task['Task Name'] = task['Title'];
        if (!task['ID']) task['ID'] = 'TASK-' + (i + 1); // Fallback ID
        
        independentTasks.push(task);
      }
    }
  }
  
  return independentTasks;
}

/**
 * Analyze sprint data from all items to determine current sprint and statistics
 * @param {Array<Object>} allItems - All project items to analyze
 * @returns {Object} Sprint analysis results with current sprint name and statistics
 */
function analyzeSprintData(allItems) {
  var today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day for comparison
  
  var sprints = {};
  var currentSprintName = 'None';
  var itemsInCurrentSprint = 0;
  var pastSprintOpenItems = 0;
  
  // Define closed statuses and stages
  var closedStatuses = ['done', 'closed', 'resolved', 'complete'];
  var stageClosedSet = {
    'complete': true,
    'completed': true,
    'done': true,
    'closed': true,
    'finished': true,
    'archived': true
  };
  
  // Pass 1: Extract all unique sprints and parse their dates
  allItems.forEach(function(item) {
    var sprintValue = item.sprint || item.Sprint;
    if (sprintValue && typeof sprintValue === 'string') {
      sprintValue.split(',').forEach(function(sprintStr) {
        var trimmedSprint = sprintStr.trim();
        if (trimmedSprint && !sprints[trimmedSprint]) {
          sprints[trimmedSprint] = parseSprintDates(trimmedSprint);
        }
      });
    }
  });

  // Find current sprint (sprint where today falls between start and end dates)
  for (var sprintFullName in sprints) {
    if (sprints.hasOwnProperty(sprintFullName)) {
      var dates = sprints[sprintFullName];
      if (dates.start && dates.end && today >= dates.start && today <= dates.end) {
        currentSprintName = formatSprint(sprintFullName);
        break; // Found the current sprint, stop looking
      }
    }
  }

  // Pass 2: Iterate through items to calculate stats
  allItems.forEach(function(item) {
    var itemSprints = (item.sprint && typeof item.sprint === 'string') ? 
      item.sprint.split(',').map(function(s) { return s.trim(); }) : [];
    var status = (item.Status || '').toLowerCase();
    var stageVal = String(item['Project Stage'] || item['ProjectStage'] || '').toLowerCase();
    var isItemClosed = stageClosedSet[stageVal] || 
      closedStatuses.some(function(closedStatus) { return status.indexOf(closedStatus) !== -1; });

    var isInCurrentSprint = false;
    if (currentSprintName !== 'None') {
      isInCurrentSprint = itemSprints.some(function(sprint) {
        return sprint.includes(currentSprintName);
      });
    }
    if (isInCurrentSprint) {
      itemsInCurrentSprint++;
    }

    // Check for past due open items
    // Use the most recent sprint (latest end date) to determine if it's past due
    var latestSprintEnd = null;
    itemSprints.forEach(function(sprint) {
      var sprintInfo = sprints[sprint];
      if (sprintInfo && sprintInfo.end) {
        if (!latestSprintEnd || sprintInfo.end > latestSprintEnd) {
          latestSprintEnd = sprintInfo.end;
        }
      }
    });
    
    var isInPastSprint = latestSprintEnd && latestSprintEnd < today;

    if (isInPastSprint && !isItemClosed) {
      pastSprintOpenItems++;
    }
  });

  return {
    currentSprintName: currentSprintName,
    itemsInCurrentSprint: itemsInCurrentSprint,
    pastSprintOpenItems: pastSprintOpenItems
  };
}
