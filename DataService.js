/**
 * @file DataService.gs
 * @description Core data logic and implementation functions.
 */

// --- LOGGING UTILITY (disabled) ---
// Timestamp logging to the "TimestampLogs" sheet has been disabled.
function logTimestampOperation(operation, details) {
  // no-op to disable timestamp logging
  return false;
}

// --- CACHING FUNCTIONS ---
function setCacheInChunks(cache, key, value, expirationInSeconds) {
  var CHUNK_SIZE = 90000;
  var chunks = [];
  for (var i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.substring(i, i + CHUNK_SIZE));
  }
  var cacheData = {};
  for (var j = 0; j < chunks.length; j++) {
    cacheData[key + '_chunk_' + j] = chunks[j];
  }
  cacheData[key + '_chunkCount'] = chunks.length.toString();
  cache.putAll(cacheData, expirationInSeconds);
}

// NEW: retrieve cached value stored in chunks
function getCacheInChunks(cache, key) {
  try {
    var chunkCountStr = cache.get(key + '_chunkCount');
    if (!chunkCountStr) return null;
    var count = parseInt(chunkCountStr, 10);
    if (isNaN(count) || count <= 0) return null;
    var parts = [];
    for (var i = 0; i < count; i++) {
      var part = cache.get(key + '_chunk_' + i);
      if (part == null) return null; // incomplete cache
      parts.push(part);
    }
    return parts.join('');
  } catch (e) {
    return null;
  }
}

// NEW: clear cached project data chunks
function clearProjectCache() {
  try {
    var cache = CacheService.getScriptCache();
    var prefix = 'project_data';
    var chunkCountStr = cache.get(prefix + '_chunkCount');
    if (!chunkCountStr) return; // nothing to clear
    var count = parseInt(chunkCountStr, 10);
    var keys = [];
    if (!isNaN(count) && count > 0) {
      for (var i = 0; i < count; i++) {
        keys.push(prefix + '_chunk_' + i);
      }
    }
    keys.push(prefix + '_chunkCount');
    cache.removeAll(keys);
  } catch (e) {
    // ignore cache clear failures
  }
}

// Helper function to decode HTML entities
function decodeHtmlEntities_(str) {
  if (!str || typeof str !== 'string') return str;
  
  // Common HTML entities mapping
  var htmlEntities = {
    '&#39;': "'",      // apostrophe
    '&apos;': "'",     // apostrophe
    '&quot;': '"',     // quote
    '&lt;': '<',       // less than
    '&gt;': '>',       // greater than
    '&amp;': '&',      // ampersand (should be last)
    '&#x27;': "'",     // apostrophe hex
    '&#x22;': '"',     // quote hex
    '&#34;': '"',      // quote decimal
    '&#60;': '<',      // less than decimal
    '&#62;': '>',      // greater than decimal
    '&#38;': '&'       // ampersand decimal
  };
  
  var result = str;
  for (var entity in htmlEntities) {
    var regex = new RegExp(entity, 'g');
    result = result.replace(regex, htmlEntities[entity]);
  }
  
  // Handle numeric HTML entities (&#decimal; and &#xhex;)
  result = result.replace(/&#(\d+);/g, function(match, dec) {
    try {
      var code = parseInt(dec, 10);
      if (code >= 32 && code <= 126) { // printable ASCII range
        return String.fromCharCode(code);
      }
    } catch (e) {}
    return match; // keep original if conversion fails
  });
  
  result = result.replace(/&#x([0-9a-fA-F]+);/g, function(match, hex) {
    try {
      var code = parseInt(hex, 16);
      if (code >= 32 && code <= 126) { // printable ASCII range
        return String.fromCharCode(code);
      }
    } catch (e) {}
    return match; // keep original if conversion fails
  });
  
  return result;
}

// Helper function to normalize values for comparison (handles Excel conversion differences)
function normalizeValue_(value) {
  if (value == null || value === undefined) {
    return '';
  }
  
  // Handle Date objects from sheet data
  if (value instanceof Date) {
    var isoString = value.toISOString();
    logTimestampOperation("Date to ISO", {
      sourceDate: value.toString(),
      convertedToISO: isoString,
      sourceType: "Date object"
    });
    return isoString;
  }
  
  var strValue = String(value);
  
  // Decode HTML entities first (before other normalization)
  strValue = decodeHtmlEntities_(strValue);
  
  // Normalize unicode whitespace & invisible characters
  // Remove BOM / zero-width, convert NBSP to normal space, collapse spaces
  strValue = strValue
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width & BOM
    .replace(/\u00A0/g, ' ') // NBSP to space
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
  
  // Remove wrapping quotes that CSV conversion might add
  if (strValue.startsWith('"') && strValue.endsWith('"')) {
    strValue = strValue.slice(1, -1).trim();
  }
  
  // Date/datetime normalization for string dates
  var datePatterns = [
    /^\d{1,2}\/\d{1,2}\/\d{2,4}(\s+\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?)?$/i, // MM/dd/yy or MM/dd/yyyy
    /^\d{4}-\d{2}-\d{2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/i, // yyyy-MM-dd
    /^\d{1,2}\/[A-Za-z]{3}\/\d{2,4}(\s+\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?)?$/i // dd/MMM/yy format from Jira
  ];
  var isDateLike = datePatterns.some(function(pattern) { return pattern.test(strValue); });
  if (isDateLike) {
    try {
      var dateStr = strValue;
      var originalDateStr = dateStr;
      var formatIdentified = "unknown";
      
      // Handle Jira format: "30/Apr/25 4:37 PM" -> "Apr 30, 2025 4:37 PM"
      if (/^\d{1,2}\/[A-Za-z]{3}\/\d{2,4}/.test(dateStr)) {
        formatIdentified = "Jira dd/MMM/yy";
        var parts = dateStr.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(.*)$/);
        if (parts) {
          var day = parts[1];
          var month = parts[2];
          var year = parts[3];
          var timeAndPeriod = parts[4] || '';
          
          // Convert 2-digit year to 4-digit
          if (year.length === 2) {
            year = '20' + year; // assume 2000-2099
          }
          
          dateStr = month + ' ' + day + ', ' + year + timeAndPeriod;
        }
      }
      
      // Convert 2-digit years to 20xx for MM/dd/yy format
      if (/\d{1,2}\/\d{1,2}\/\d{2}(\s|$)/.test(dateStr)) {
        formatIdentified = "MM/dd/yy";
        dateStr = dateStr.replace(/(\/)\s*(\d{2})(?=\s|$)/, function(match, slash, yy) {
          return '/' + '20' + yy; // assume 2000-2099
        });
      } else if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        formatIdentified = "ISO yyyy-MM-dd";
      }
      
      var date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        var isoString = date.toISOString();
        
        logTimestampOperation("String Date to ISO", {
          sourceDate: originalDateStr,
          normalizedDateStr: dateStr,
          formatIdentified: formatIdentified,
          convertedToISO: isoString,
          sourceType: "String"
        });
        
        return isoString;
      }
    } catch (e) { /* keep original */ }
  }
  
  // Number normalization
  if (/^[\d.,]+$/.test(strValue)) {
    try {
      var num = parseFloat(strValue.replace(/,/g, ''));
      if (!isNaN(num)) return String(num);
    } catch (e) { /* keep original */ }
  }
  
  return strValue;
}

// NEW: Strict UTC parser for sheet timestamp strings (avoids double conversion)
function parseUtcTimestampString_(val) {
  try {
    if (val == null) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
    var s = String(val).trim();
    if (!s) return null;

    // If already ISO with timezone info, trust it
    if (/Z$/i.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
      var dIso = new Date(s);
      return isNaN(dIso.getTime()) ? null : dIso.toISOString();
    }

    // Jira-style: dd/MMM/yy[yy][ HH:mm[:ss] [AM|PM]]
    var jiraRe = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i;
    var jm = s.match(jiraRe);
    if (jm) {
      var day = parseInt(jm[1], 10);
      var monStr = jm[2].toLowerCase();
      var year = parseInt(jm[3], 10);
      if (year < 100) year += 2000;
      var hh = jm[4] ? parseInt(jm[4], 10) : 0;
      var mi = jm[5] ? parseInt(jm[5], 10) : 0;
      var ss = jm[6] ? parseInt(jm[6], 10) : 0;
      var ampm = jm[7] ? jm[7].toUpperCase() : '';
      var months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
      var mm = months[monStr];
      if (mm == null) return null;
      if (ampm) {
        if (ampm === 'AM') { if (hh === 12) hh = 0; }
        else if (ampm === 'PM') { if (hh !== 12) hh += 12; }
      }
      var utcMsJ = Date.UTC(year, mm, day, hh, mi, ss);
      return new Date(utcMsJ).toISOString();
    }

    // US slash date: M/D/YYYY[ HH:mm[:ss][ AM|PM]]
    var slashRe = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i;
    var m = s.match(slashRe);
    if (m) {
      var mm = parseInt(m[1], 10);
      var dd = parseInt(m[2], 10);
      var yy = parseInt(m[3], 10);
      if (yy < 100) yy += 2000;
      var h = m[4] ? parseInt(m[4], 10) : 0;
      var mi2 = m[5] ? parseInt(m[5], 10) : 0;
      var ss2 = m[6] ? parseInt(m[6], 10) : 0;
      var ap = m[7] ? m[7].toUpperCase() : '';
      if (ap) {
        if (ap === 'AM') { if (h === 12) h = 0; }
        else if (ap === 'PM') { if (h !== 12) h += 12; }
      }
      var ms = Date.UTC(yy, mm - 1, dd, h, mi2, ss2);
      return new Date(ms).toISOString();
    }

    // Date-only 'YYYY-MM-DD' -> UTC midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var p = s.split('-');
      var msOnly = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 0, 0, 0);
      return new Date(msOnly).toISOString();
    }

    // 'YYYY-MM-DD HH:mm:ss' without TZ -> treat as UTC
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)) {
      var d2 = new Date(s.replace(' ', 'T') + 'Z');
      return isNaN(d2.getTime()) ? null : d2.toISOString();
    }

    // Fallback: attempt as-is; if no TZ info, append Z
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      if (!(/[+-]\d{2}:?\d{2}$|Z$/).test(s)) {
        var dZ = new Date(s + 'Z');
        if (!isNaN(dZ.getTime())) return dZ.toISOString();
      }
      return d.toISOString();
    }
    return null;
  } catch (e) {
    logTimestampOperation('UTC Parser Error', { input: val, error: e.toString() });
    return null;
  }
}

// Field-aware equality to avoid false positives (e.g., Sprint lists)
function equalFieldValues_(header, existingRaw, uploadedRaw) {
  // Normalize first
  var a = normalizeValue_(existingRaw);
  var b = normalizeValue_(uploadedRaw);
  
  if (a === b) return true;
  
  var h = String(header || '').toLowerCase();
  
  // Special handling for sprint columns: compare as normalized sets
  if (h === 'sprint' || h.indexOf('sprint') !== -1) {
    function toSprintSet(val) {
      if (!val) return new Set();
      var parts = String(val)
        .replace(/[\[\]()]/g, ' ') // drop brackets
        .split(/[,;]+/)
        .map(function(s){ return String(s).trim(); })
        .filter(function(s){ return s.length > 0; })
        .map(function(s){ try { return formatSprint ? formatSprint(s) : s; } catch (e) { return s; } })
        .map(function(s){ return s.replace(/\s+/g, ' ').trim(); });
      return new Set(parts);
    }
    var setA = toSprintSet(a);
    var setB = toSprintSet(b);
    if (setA.size !== setB.size) return false;
    for (var v of setA) { if (!setB.has(v)) return false; }
    return true;
  }
  
  // Normalize common name fields by collapsing spaces
  if (h.indexOf('assignee') !== -1 || h.indexOf('pm lead') !== -1) {
    var na = a.replace(/\s+/g, ' ');
    var nb = b.replace(/\s+/g, ' ');
    return na === nb;
  }
  
  // Log differences for debugging only if they're significant
  if (a !== b) {
    console.log('FIELD DIFFERENCE [' + header + ']: "' + a + '" vs "' + b + '"');
  }
  
  // Default string equality after normalization already handled
  return false;
}

// --- SPRINT LOGIC HELPER ---
function parseSprintDates(sprintString) {
  try {
    var dateMatch = sprintString.match(/(\d{1,2}\.\d{1,2})\s*-\s*(\d{1,2}\.\d{1,2})/);
    if (!dateMatch) return { start: null, end: null };
    var today = new Date();
    var currentYear = today.getFullYear();
    var startDateParts = dateMatch[1].split('.');
    var endDateParts = dateMatch[2].split('.');
    var startDate = new Date(currentYear, parseInt(startDateParts[0]) - 1, parseInt(startDateParts[1]));
    var endDate = new Date(currentYear, parseInt(endDateParts[0]) - 1, parseInt(endDateParts[1]));
    if (startDate > endDate) endDate.setFullYear(currentYear + 1);
    endDate.setHours(23, 59, 59, 999);
    return { start: startDate, end: endDate };
  } catch (e) {
    return { start: null, end: null };
  }
}

function formatSprint(sprintString) {
  if (!sprintString || typeof sprintString !== 'string') return '—';
  var match = sprintString.match(/(Sprint\s?\d+)/i);
  return match ? match[1].trim() : '—';
}

// --- IMPLEMENTATION FUNCTIONS (called by main.js) ---
function getProjectData_() {
  try {
    
    
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
    
    
    var flatten = function(arr) { return arr.reduce(function(acc, val) { return acc.concat(val); }, []); };
    var actPctOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("A2:A" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var planningStageOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("B2:B" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var projectStageOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("C2:C" + configSheet.getLastRow()).getValues()).filter(String) : [];
  // Per-type project stage options (optional)
  var epicProjectStageOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("E2:E" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var storyProjectStageOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("F2:F" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var bugProjectStageOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("G2:G" + configSheet.getLastRow()).getValues()).filter(String) : [];
  var priorityOptions = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("M2:M" + configSheet.getLastRow()).getValues()).filter(String) : [];
    
  // Load Helpful Links (JSON in D2), closed mappings (H/I as multi-row lists), and stage↔status mappings (J/K pairs) - restored original positions
    var helpfulLinks = [];
    var closedProjectStages = [];
  var closedStatuses = [];
  var pastSprintClosedStages = [];
  var stageStatusMappings = [];
    try {
      var linksData = configSheet.getRange("D2").getValue();
      if (linksData && typeof linksData === 'string') {
        helpfulLinks = JSON.parse(linksData);
      }
    } catch (e) {
      
      helpfulLinks = helpfulLinks || [];
    }

    // Prefer multi-row lists in columns H and I; and pairs in J/K - restored original positions
    if (configSheet.getLastRow() > 1) {
      try {
        closedProjectStages = flatten(configSheet.getRange("H2:H" + configSheet.getLastRow()).getValues()).filter(String);
        // Optional Past Sprint Closed stages in L - restored original position
        try {
          pastSprintClosedStages = flatten(configSheet.getRange("L2:L" + configSheet.getLastRow()).getValues()).filter(String);
        } catch (e) {
          pastSprintClosedStages = [];
        }
  // closedStatuses deprecated for sync logic; still read if present to avoid breaking existing sheets
  closedStatuses = flatten(configSheet.getRange("I2:I" + configSheet.getLastRow()).getValues()).filter(String);
        // Read stage↔status pairs: J = Project Stage, K = comma-separated expected statuses - restored original positions
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
        
      }
    }
    
    var config = { 
      actPctOptions: actPctOptions, 
      planningStageOptions: planningStageOptions, 
      projectStageOptions: projectStageOptions, 
      epicProjectStageOptions: epicProjectStageOptions,
      storyProjectStageOptions: storyProjectStageOptions,
      bugProjectStageOptions: bugProjectStageOptions,
      priorityOptions: priorityOptions,
      helpfulLinks: helpfulLinks,
      closedProjectStages: closedProjectStages,
  // closedStatuses kept only for backward compatibility; not used for sync
  closedStatuses: closedStatuses,
  stageStatusMappings: stageStatusMappings,
  pastSprintClosedStages: pastSprintClosedStages
    };
    
    
    
    var projects = readJiraData(jiraSheet);
    
    
    
    var manualDataMap = readManualData(manualDataSheet);
    
    
    
    var independentTasks = readIndependentTasks(independentTasksSheet);
    
    
    
    
    var combinedProjects = projects.map(function(p) {
      var jiraId = String(p['Jira #']);
      var manualData = manualDataMap[jiraId] || {};
      
      if (Object.keys(manualData).length > 0) {
        
      } else {
        
      }
      
      var combined = {};
      for (var key in p) {
          if (p.hasOwnProperty(key)) combined[key] = p[key];
      }
      for (var keyManual in manualData) {
          if (manualData.hasOwnProperty(keyManual)) combined[keyManual] = manualData[keyManual];
      }
      return combined;
    });
    
    
    
    var allItems = combinedProjects.concat(independentTasks);
    var sprintStats = analyzeSprintData(allItems);
    
    
    var finalData = { 
      projects: combinedProjects, 
      independentTasks: independentTasks, 
      config: config,
      sprintStats: sprintStats
    };
    
    // Log sample of timestamp data before returning to client
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
    
    setCacheInChunks(cache, cacheKey, JSON.stringify(finalData), 600);
    return finalData;

  } catch (e) {
    
    
    // Return a structured error object so the client doesn't crash
    return { error: true, message: e.toString(), stack: e.stack };
  }
}

function importJiraCsv_(fileData) {
  if (!fileData || !fileData.base64Data) {
    return { status: 'error', message: 'No file data received to import.' };
  }
  
  // All files are converted to CSV on the client side now
  var fileName = fileData.fileName || '';
  if (!fileName.toLowerCase().endsWith('.csv')) {
    return { status: 'error', message: 'Invalid file type. Expected CSV format.' };
  }

  try {
    var sheet = getSheetOrThrow(SpreadsheetApp.getActiveSpreadsheet(), JIRA_DATA_SHEET);
    
    var existingDataRange = sheet.getDataRange();
    // *** FIX: Use getValues() to read raw sheet data for comparison with CSV ***
    var existingValues = existingDataRange.getValues(); 
    var headers = existingValues.shift();
    var jiraIdColIndex = headers.indexOf('Jira #');
    if (jiraIdColIndex === -1) {
      return { status: 'error', message: 'Could not find "Jira #" column in the sheet.' };
    }

    var existingDataMap = new Map();
    existingValues.forEach(function(row, index) {
      var jiraId = row[jiraIdColIndex] ? String(row[jiraIdColIndex]).trim() : null;
      if (jiraId) {
        existingDataMap.set(jiraId, { data: row, sheetRowIndex: index + 2 });
      }
    });

    var blob = Utilities.newBlob(Utilities.base64Decode(fileData.base64Data), fileData.mimeType, fileData.fileName);
    
    // All files are now CSV format (converted on client side if needed)
    var uploadedValues = Utilities.parseCsv(blob.getDataAsString('UTF-8'));
    
    // Debug: Log total rows in uploaded file
    console.log('UPLOAD DEBUG: Total rows in uploaded file: ' + uploadedValues.length);
    
    let headerRowIndex = -1;
    let uploadedHeaders = [];

    // Helper to normalize header strings (trim, lowercase, strip BOM/non-breaking spaces)
    function normalizeHeader(h) {
      if (h === undefined || h === null) return '';
      return String(h).replace(/^[\uFEFF\u00A0]+/, '').trim().toLowerCase();
    }

    // Look for a header row that contains a Jira key column. Check a larger window of rows for HTML-based Excel files
    var maxHeaderSearchRows = Math.min(50, uploadedValues.length); // Increased from 20 to 50
    console.log('HEADER SEARCH: Will search first ' + maxHeaderSearchRows + ' rows for headers');
    
    for (let i = 0; i < maxHeaderSearchRows; i++) {
      var row = uploadedValues[i];
      if (!row || row.length === 0) continue;
      
      console.log('HEADER SEARCH ROW ' + (i + 1) + ': [' + (row || []).map(function(cell) { return '"' + (cell || '') + '"'; }).join(', ') + ']');
      
      var foundKey = false;
      for (var j = 0; j < row.length; j++) {
        var colNameRaw = row[j] || '';
        var colName = normalizeHeader(colNameRaw);
        // Accept exact 'key', common Jira exports 'issue key', and variants containing 'key'
        // Also look for common patterns like data-issue-key attributes from HTML exports
        if (colName === 'key' || 
            colName === 'issue key' || 
            colName === 'issuekey' || 
            colName === 'jira key' || 
            colName.indexOf('key') !== -1 ||
            colNameRaw.indexOf('data-issue-key') !== -1 ||
            colNameRaw.indexOf('issue-link') !== -1) {
          foundKey = true;
          console.log('FOUND KEY in row ' + (i + 1) + ', column ' + (j + 1) + ': "' + colNameRaw + '" (normalized: "' + colName + '")');
          break;
        }
      }
      if (foundKey) {
        headerRowIndex = i;
        uploadedHeaders = row.map(function(col) { return col === undefined || col === null ? '' : String(col).trim(); });
        
        // Debug: Log where headers were found for troubleshooting
        console.log('HEADER DETECTION: Found headers on row ' + (i + 1) + ': [' + uploadedHeaders.join(', ') + ']');
        
        break;
      }
    }

    if (headerRowIndex === -1) {
      var sampleRows = uploadedValues.slice(0, Math.min(20, uploadedValues.length)).map(function(row, idx) { 
        return 'Row ' + (idx + 1) + ': [' + (row || []).map(function(cell) { return JSON.stringify(cell); }).join(', ') + ']'; 
      }).join('\n');
      var detectedHeaders = uploadedValues.slice(0, Math.min(20, uploadedValues.length)).map(function(row) {
        return (row || []).map(function(cell) { return normalizeHeader(cell || ''); });
      });
      
      // Additional debug: check if any row contains "key" after normalization
      var debugInfo = '';
      for (var debugRow = 0; debugRow < Math.min(20, uploadedValues.length); debugRow++) {
        var row = uploadedValues[debugRow];
        if (row && row.length > 0) {
          var keyMatches = [];
          for (var debugCol = 0; debugCol < row.length; debugCol++) {
            var colName = normalizeHeader(row[debugCol] || '');
            if (colName.indexOf('key') !== -1) {
              keyMatches.push('Col ' + debugCol + ': "' + (row[debugCol] || '') + '" (normalized: "' + colName + '")');
            }
          }
          if (keyMatches.length > 0) {
            debugInfo += '\nRow ' + (debugRow + 1) + ' key matches: ' + keyMatches.join(', ');
          }
        }
      }
      
      return { 
        status: 'error', 
        message: '[V2.5] Could not find header row with a Jira key column in the uploaded file (searched in first ' + maxHeaderSearchRows + ' rows, total file has ' + uploadedValues.length + ' rows).\n\n' +
                 'Looking for columns containing: "key", "issue key", "issuekey", "jira key", or any header containing "key".\n\n' +
                 'Detected normalized headers in first ' + Math.min(20, uploadedValues.length) + ' rows:\n' + 
                 detectedHeaders.map(function(row, idx) { return 'Row ' + (idx + 1) + ': [' + row.join(', ') + ']'; }).join('\n') + '\n\n' +
                 'Sample raw data:\n' + sampleRows + 
                 (debugInfo ? '\n\nDEBUG - Found potential key columns:' + debugInfo : '\n\nDEBUG - No columns containing "key" found in first 20 rows') + 
                 '\n\nTROUBLESHOOTING:\n' +
                 '1. If this is an HTML-based Excel export, try opening in Excel and saving as CSV\n' +
                 '2. If the file has only ' + uploadedValues.length + ' rows, it may be incomplete - try re-exporting from Jira\n' +
                 '3. Ensure your export includes a "Key" or "Issue Key" column\n' +
                 '4. For HTML table exports, use "Copy to clipboard" then paste into Excel first'
      };
    }
    
    const headerNameMap = {
      'Key': 'Jira #', 'Summary': 'Summary', 'Status': 'Status', 'Issue Type': 'Issue Type',
      'Assignee': 'Assignee', 'Sprint': 'sprint', 'Epic Link': 'Epic Link', 'PM Lead': 'PM Lead',
      'Story Points': 'Story Points', 'Updated': 'Updated', 'Resolved': 'Resolved', 'Created': 'Created'
    };
    
    const headerMap = {};
    // Build a case-insensitive mapping helper for uploaded headers
    var uploadedHeadersNorm = uploadedHeaders.map(function(h){ return normalizeHeader(h); });

    function findUploadedIndex(uploadHeaderName) {
      var targetNorm = normalizeHeader(uploadHeaderName);
      // 1) exact match against raw header text
      var idx = uploadedHeaders.indexOf(uploadHeaderName);
      if (idx !== -1) return idx;
      // 2) case-insensitive / BOM-normalized exact match
      idx = uploadedHeadersNorm.indexOf(targetNorm);
      if (idx !== -1) return idx;
      // 3) relaxed matching for the 'Key' column: any header containing 'key'
      if (targetNorm === 'key') {
        for (var k = 0; k < uploadedHeadersNorm.length; k++) {
          if (uploadedHeadersNorm[k].indexOf('key') !== -1) return k;
        }
      }
      // 4) for common synonyms, allow matching where uploaded header contains the target tokens
      for (var m = 0; m < uploadedHeadersNorm.length; m++) {
        if (uploadedHeadersNorm[m].indexOf(targetNorm) !== -1) return m;
      }
      return -1;
    }

    headers.forEach(function(sheetHeader, sheetIndex) {
        const uploadHeaderName = Object.keys(headerNameMap).find(function(k){ return headerNameMap[k] === sheetHeader; }) || sheetHeader;
        const uploadIndex = findUploadedIndex(uploadHeaderName);
        headerMap[sheetHeader] = { 
            sheetIndex: sheetIndex, 
            uploadIndex: uploadIndex
        };
    });

    // Ensure we can find the Jira ID column (try flexible checks as backup)
    if (headerMap['Jira #'].uploadIndex === -1) {
        for (var u = 0; u < uploadedHeaders.length; u++) {
          if (normalizeHeader(uploadedHeaders[u]).indexOf('key') !== -1) {
            headerMap['Jira #'].uploadIndex = u;
            break;
          }
        }
    }

    if (headerMap['Jira #'].uploadIndex === -1) {
        return { status: 'error', message: 'Could not find a Jira key column in the uploaded CSV file. Detected headers: ' + uploadedHeaders.join(', ') };
    }

    var rowsToAdd = [];
    var rowsToUpdate = [];
    var addedItems = [];
    var updatedItems = [];
    var archivedItems = [];
    
    
    

    for (let i = headerRowIndex + 1; i < uploadedValues.length; i++) {
      const uploadedRow = uploadedValues[i];

      if (uploadedRow[0] && uploadedRow[0].toString().startsWith('Generated at')) {
        continue; 
      }
      if (uploadedRow.length < 2) continue;

      var uploadJiraId = headerMap['Jira #'].uploadIndex;
      var jiraId = uploadedRow[uploadJiraId] ? String(uploadedRow[uploadJiraId]).trim() : null;
      
      

      if (jiraId && existingDataMap.has(jiraId)) {
        var existingRecord = existingDataMap.get(jiraId);
        
        // Check if this item was previously archived
        var currentIcon = existingRecord.data[0];
        var wasArchived = currentIcon === '📁';
        
        var hasChanged = false;
        var changedFields = [];
        
        // If item was archived but now appears in upload, it's been unarchived
        if (wasArchived) {
          hasChanged = true;
          changedFields.push('Unarchived');
          console.log('UNARCHIVING item ' + jiraId + ' - was archived but now appears in upload');
        }
        
        for (var j = 0; j < headers.length; j++) {
          var header = headers[j];
          if (headerMap[header].uploadIndex !== -1 && header !== 'Sync Status') {
            // Field-aware comparison to minimize false positives
            var existingRaw = existingRecord.data[j];
            var uploadedRaw = uploadedRow[headerMap[header].uploadIndex];
            if (!equalFieldValues_(header, existingRaw, uploadedRaw)) {
              hasChanged = true;
              changedFields.push(header);
              console.log('FIELD CHANGE DETECTED for ' + jiraId + ' in field "' + header + '": ' +
                'existing="' + existingRaw + '" (type: ' + typeof existingRaw + ') ' +
                'uploaded="' + uploadedRaw + '" (type: ' + typeof uploadedRaw + ') ' +
                'normalized existing="' + normalizeValue_(existingRaw) + '" ' +
                'normalized uploaded="' + normalizeValue_(uploadedRaw) + '"');
            }
          }
        }
        
        // Always log the result for debugging
        console.log('RECORD ' + jiraId + ' hasChanged: ' + hasChanged + ', changedFields: [' + changedFields.join(', ') + ']');
        
        // Only update the row if there are actual changes OR if it was archived
        if (hasChanged) {
          var updatedRowData = [];
          headers.forEach(function(header, headerIndex) {
            if (headerIndex === 0) {
              // First column: use appropriate icon (remove archive icon if was archived)
              if (wasArchived) {
                // Item was archived, now unarchived - use sync status icon
                updatedRowData.push('🔄'); 
              } else {
                // Keep existing icon or use sync status
                updatedRowData.push('🔄');
              }
            } else if (header === 'Sync Status') {
              updatedRowData.push('🔄'); // Mark as changed
            } else if (headerMap[header].uploadIndex !== -1) {
              updatedRowData.push(uploadedRow[headerMap[header].uploadIndex]);
            } else {
              updatedRowData.push(existingRecord.data[headerIndex]);
            }
          });
          
          rowsToUpdate.push({ sheetRowIndex: existingRecord.sheetRowIndex, data: updatedRowData });
          updatedItems.push({
            jiraId: jiraId,
            summary: uploadedRow[headerMap['Summary'].uploadIndex] || '',
            changedFields: changedFields,
            wasUnarchived: wasArchived
          });
        } else {
          // No changes detected, but we should still update sync status to ✅ if it's not already
          var currentSyncStatus = existingRecord.data[headers.indexOf('Sync Status')];
          if (currentSyncStatus !== '✅') {
            var syncOnlyRowData = existingRecord.data.slice(); // Copy existing data
            syncOnlyRowData[headers.indexOf('Sync Status')] = '✅'; // Update only sync status
            rowsToUpdate.push({ sheetRowIndex: existingRecord.sheetRowIndex, data: syncOnlyRowData });
          }
        }
        
        existingDataMap.delete(jiraId);
      } else if (jiraId) {
        var newRowData = [];
        headers.forEach(function(header) {
            if (header === 'Sync Status') {
                newRowData.push('🔄');
            } else if (headerMap[header].uploadIndex !== -1) {
                newRowData.push(uploadedRow[headerMap[header].uploadIndex]);
            } else {
                newRowData.push('');
            }
        });
        rowsToAdd.push(newRowData);
        addedItems.push({
          jiraId: jiraId,
          summary: uploadedRow[headerMap['Summary'].uploadIndex] || '',
          issueType: uploadedRow[headerMap['Issue Type'].uploadIndex] || ''
        });
      } else {
        
      }
    }

    // Archive remaining items (removed from Jira) - only if archiveMissing is true
    var shouldArchiveMissing = fileData.archiveMissing !== false; // Default to true if not specified
    if (shouldArchiveMissing) {
      
      existingDataMap.forEach(function(staleRecord, jiraId) {
        // Check if the item is already archived (has 📁 icon in first column)
        var currentIcon = staleRecord.data[0];
        var isAlreadyArchived = currentIcon === '📁';
        
        if (!isAlreadyArchived) {
          // Only archive if not already archived
          sheet.getRange(staleRecord.sheetRowIndex, 1).setValue('📁');
          archivedItems.push({
            jiraId: jiraId,
            summary: staleRecord.data[headerMap['Summary'].sheetIndex] || ''
          });
          console.log('DEBUG: Archiving item ' + jiraId + ' (was not already archived)');
        } else {
          console.log('DEBUG: Skipping already archived item ' + jiraId);
        }
      });
    } else {
      
    }
    
    rowsToUpdate.forEach(function(update) {
        sheet.getRange(update.sheetRowIndex, 1, 1, update.data.length).setValues([update.data]);
    });

    if (rowsToAdd.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
    }
    
    clearProjectCache();
    
    // Separate unarchived items from regular updates for reporting
    var unarchivedItems = updatedItems.filter(function(item) { return item.wasUnarchived; });
    var regularUpdatedItems = updatedItems.filter(function(item) { return !item.wasUnarchived; });
    
    console.log('UPLOAD COMPLETED - Final counts: added=' + addedItems.length + ', updated=' + regularUpdatedItems.length + ', unarchived=' + unarchivedItems.length + ', archived=' + archivedItems.length);
    console.log('Added items: ' + addedItems.map(function(item) { return item.jiraId; }).join(', '));
    console.log('Updated items: ' + regularUpdatedItems.map(function(item) { return item.jiraId; }).join(', '));
    console.log('Unarchived items: ' + unarchivedItems.map(function(item) { return item.jiraId; }).join(', '));
    console.log('Archived items: ' + archivedItems.map(function(item) { return item.jiraId; }).join(', '));
    
    return { 
      status: 'success', 
      message: 'Data successfully updated! Headers found on row ' + (headerRowIndex + 1) + ', processed ' + (uploadedValues.length - headerRowIndex - 1) + ' data rows.',
      results: {
        added: addedItems.length,
        updated: regularUpdatedItems.length,
        unarchived: unarchivedItems.length,
        archived: archivedItems.length,
        total: addedItems.length + regularUpdatedItems.length + unarchivedItems.length + archivedItems.length,
        details: {
          addedItems: addedItems,
          updatedItems: regularUpdatedItems,
          unarchivedItems: unarchivedItems,
          archivedItems: archivedItems
        }
      }
    };

  } catch (e) {
    
    return { status: 'error', message: 'Failed to import data: ' + e.message };
  }
}

function saveConfiguration_(optionsData) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getSheetOrThrow(ss, CONFIG_SHEET);
    
    // Set headers (extend with per-type options; mappings are lists in H/I)
    sheet.getRange("A1:M1").setValues([[
      "ACT/PCT Options", 
      "Planning Stage Options", 
      "Project Stage Options", 
      "HelpfulLinks",
      "Epic Project Stage Options",
      "Story Project Stage Options",
      "Bug Project Stage Options",
      "Closed Project Stages",
      "Closed Status Keywords",
      "Stage→Status (JSON)",
      "Stage→Status Keywords",
      "Past Sprint Closed Project Stages",
      "Priority Options"
    ]]);
    
    // Clear existing data
  sheet.getRange("A2:M" + sheet.getMaxRows()).clearContent();
    
    // Prepare data
    var actData = optionsData.actPctOptions.map(function(o) { return [o]; });
    var planData = optionsData.planningStageOptions.map(function(o) { return [o]; });
    var projData = optionsData.projectStageOptions.map(function(o) { return [o]; });
    var epicProjData = (optionsData.epicProjectStageOptions || []).map(function(o) { return [o]; });
    var storyProjData = (optionsData.storyProjectStageOptions || []).map(function(o) { return [o]; });
    var bugProjData = (optionsData.bugProjectStageOptions || []).map(function(o) { return [o]; });
    var priorityData = (optionsData.priorityOptions || []).map(function(o) { return [o]; });
    
    // Set option data
    if (actData.length > 0) sheet.getRange(2, 1, actData.length, 1).setValues(actData);
    if (planData.length > 0) sheet.getRange(2, 2, planData.length, 1).setValues(planData);
    if (projData.length > 0) sheet.getRange(2, 3, projData.length, 1).setValues(projData);
    // Set per-type options in E, F, G (restored original positions)
    if (epicProjData.length > 0) sheet.getRange(2, 5, epicProjData.length, 1).setValues(epicProjData);
    if (storyProjData.length > 0) sheet.getRange(2, 6, storyProjData.length, 1).setValues(storyProjData);
    if (bugProjData.length > 0) sheet.getRange(2, 7, bugProjData.length, 1).setValues(bugProjData);
    // Set priority options in M (column 13)
    if (priorityData.length > 0) sheet.getRange(2, 13, priorityData.length, 1).setValues(priorityData);
    
  // Set Helpful Links JSON blob
  sheet.getRange("D2").setValue(JSON.stringify(optionsData.helpfulLinks || []));
  
  // Write mappings as multi-row lists (H and I) - restored original positions
  var closedStagesData = (optionsData.closedProjectStages || []).map(function(o) { return [o]; });
  var closedStatusesData = (optionsData.closedStatuses || []).map(function(o) { return [o]; });
  if (closedStagesData.length > 0) sheet.getRange(2, 8, closedStagesData.length, 1).setValues(closedStagesData);
  if (closedStatusesData.length > 0) sheet.getRange(2, 9, closedStatusesData.length, 1).setValues(closedStatusesData);
  // Write Past Sprint Closed Project Stages (L) - restored original position
  var pastSprintClosedData = (optionsData.pastSprintClosedStages || []).map(function(o){ return [o]; });
  if (pastSprintClosedData.length > 0) sheet.getRange(2, 12, pastSprintClosedData.length, 1).setValues(pastSprintClosedData);

  // Write Stage↔Status mappings: store JSON copy in J2 for convenience and pairs starting at row 2 in J/K - restored original positions
  var stageStatus = Array.isArray(optionsData.stageStatusMappings) ? optionsData.stageStatusMappings : [];
  sheet.getRange("J2").setValue(JSON.stringify(stageStatus));
  if (stageStatus.length > 0) {
    var pairRows = stageStatus.map(function(m){ return [m.stage || '', (m.expectedStatuses || []).join(', ')]; });
    sheet.getRange(2, 10, pairRows.length, 2).setValues(pairRows);
  }
    
    clearProjectCache();
    return { status: 'success', message: 'Configuration saved!' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}
function saveManualData_(jiraId, field, value) {
  try {
    var sheet = getSheetOrThrow(SpreadsheetApp.getActiveSpreadsheet(), MANUAL_DATA_SHEET);
    var data = sheet.getDataRange().getValues();
    var rowToUpdate = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] == jiraId) {
        rowToUpdate = i + 1;
        break;
      }
    }
    var colToUpdate;
    if (field === 'ACT/PCT') colToUpdate = 2;
    else if (field === 'Planning Stage') colToUpdate = 3;
    else if (field === 'Project Stage') colToUpdate = 4;
    else if (field === 'Start Date') colToUpdate = 6;
    else if (field === 'End Date') colToUpdate = 7;
    else if (field === 'Priority') colToUpdate = 9;
    
    // Log any date field updates
    if (field === 'Start Date' || field === 'End Date') {
      // Get previous value if it exists
      var previousValue = null;
      if (rowToUpdate > 0) {
        previousValue = data[rowToUpdate-1][colToUpdate-1];
      }
      
      logTimestampOperation("Manual Date Field Update", {
        jiraId: jiraId,
        field: field,
        previousValue: previousValue ? (previousValue instanceof Date ? previousValue.toISOString() : String(previousValue)) : null,
        newValue: value,
        dateType: typeof value,
        action: rowToUpdate > 0 ? "update_existing" : "create_new_row"
      });
    }

    if (rowToUpdate > 0 && colToUpdate) {
      sheet.getRange(rowToUpdate, colToUpdate).setValue(value || null);
    } else if (colToUpdate) { 
      var newRow = [jiraId, '', '', '', null, null, null, '', ''];
      newRow[0] = jiraId;
      newRow[colToUpdate - 1] = value || null;
      sheet.appendRow(newRow);
    }
    clearProjectCache();
    return { status: 'success', message: 'Data saved!' };
  } catch (e) {
    return { status: 'error', message: 'Failed to save data: ' + e.message };
  }
}
function saveIndependentTask_(taskData) {
  try { var sheet = getSheetOrThrow(SpreadsheetApp.getActiveSpreadsheet(), INDEPENDENT_TASKS_SHEET); var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; var idIndex = headers.indexOf('ID'); var newRow = headers.map(function(header) { return taskData[header] || ''; }); if (taskData.ID) { var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues(); var rowIndex = -1; for (var i = 0; i < data.length; i++) { if (data[i][idIndex] === taskData.ID) { rowIndex = i + 2; break; } } if (rowIndex !== -1) { sheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]); } } else { newRow[idIndex] = Utilities.getUuid(); sheet.appendRow(newRow); } clearProjectCache(); return { status: 'success', message: 'Task saved successfully!' }; } catch (e) { return { status: 'error', message: 'Failed to save task: ' + e.message }; }
}

function updateLastChecked_(jiraId) {
  try {
    var sheet = getSheetOrThrow(SpreadsheetApp.getActiveSpreadsheet(), MANUAL_DATA_SHEET);
    var data = sheet.getDataRange().getValues();
    var rowToUpdate = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] == jiraId) {
        rowToUpdate = i + 1;
        break;
      }
    }
    var timestamp = new Date();
    
    // Log the timestamp we're about to save
    logTimestampOperation("Update Last Checked", {
      jiraId: jiraId,
      timestamp: timestamp.toString(),
      timestampIso: timestamp.toISOString(),
      action: rowToUpdate > 0 ? "update_existing_row" : "append_new_row"
    });
    
    // Create a flag to indicate this is a UTC timestamp
    // This will help the readJiraData function identify timestamps that should be treated as UTC
    var utcTimestampObj = {
      value: timestamp,
      isUTC: true
    };
    
    if (rowToUpdate > 0) {
      // Set the timestamp with a note to indicate it's in UTC
      var cell = sheet.getRange(rowToUpdate, 5);
      cell.setValue(timestamp);
      cell.setNote("UTC timestamp set by system on " + new Date().toISOString());
    } else {
      sheet.appendRow([jiraId, '', '', '', timestamp, null, null, '']);
      // Add note to the new timestamp cell
      if (sheet.getLastRow() > 1) {
        sheet.getRange(sheet.getLastRow(), 5).setNote("UTC timestamp set by system on " + new Date().toISOString());
      }
    }
    clearProjectCache();
    // Return the new timestamp so the UI can update seamlessly
    return { 
      status: 'success', 
      message: 'Timestamp updated!', 
      newTimestamp: timestamp.toISOString() 
    };
  } catch (e) {
    return { status: 'error', message: 'Failed to update timestamp: ' + e.message };
  }
}

function forceGetProjectData_() {
  clearProjectCache();
  return getProjectData_();
}

// --- INTERNAL HELPER FUNCTIONS ---
function getSheetOrThrow(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Required sheet '" + sheetName + "' was not found.");
  return sheet;
}
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
  } else {
    
  }
  
  return manualDataMap;
}

function readIndependentTasks(independentTasksSheet) {
    var independentTasks = [];
    if (independentTasksSheet.getLastRow() > 1) {
        var taskHeaders = independentTasksSheet.getRange(1, 1, 1, independentTasksSheet.getLastColumn()).getValues()[0];
        var taskValues = independentTasksSheet.getRange(2, 1, independentTasksSheet.getLastRow() - 1, independentTasksSheet.getLastColumn()).getValues();
        for (var i = 0; i < taskValues.length; i++) {
            var row = taskValues[i];
            var task = {};
            for (var j = 0; j < taskHeaders.length; j++) {
                var header = taskHeaders[j];
                // Check if the value is a Date object and convert it to a string if it is
                if (row[j] instanceof Date) {
                    task[header] = row[j].toISOString();
                } else {
                    task[header] = row[j];
                }
            }
            independentTasks.push(task);
        }
    }
    return independentTasks;
}

function analyzeSprintData(allItems) {
    var today = new Date();
  // Closed status keywords fallback only; UI provides stage-based closed lists
  var closedStatuses = ['closed', 'done', 'resolved', 'in production', 'production', 'fixed'];
    var currentSprintName = 'None';
    var itemsInCurrentSprint = 0;
    var pastSprintOpenItems = 0;
    var sprints = {}; // Cache for parsed sprint dates
    // Build stage-based closure set from config
    var stageClosedSet = {};
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var configSheet = getSheetOrThrow(ss, CONFIG_SHEET);
      var flatten = function(arr) { return arr.reduce(function(acc, val) { return acc.concat(val); }, []); };
      var closedStages = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("H2:H" + configSheet.getLastRow()).getValues()).filter(String) : [];
      var pastClosed = configSheet.getLastRow() > 1 ? flatten(configSheet.getRange("L2:L" + configSheet.getLastRow()).getValues()).filter(String) : [];
      closedStages.concat(pastClosed).forEach(function(v){ stageClosedSet[String(v).toLowerCase()] = true; });
    } catch (e) { /* ignore, fallback to status keywords only */ }

    // Pass 1: Parse all unique sprints and find the current one
    allItems.forEach(function(item) {
        if (item.sprint && typeof item.sprint === 'string') {
            item.sprint.split(',').forEach(function(sprintStr) {
                var trimmedSprint = sprintStr.trim();
                if (trimmedSprint && !sprints[trimmedSprint]) {
                    sprints[trimmedSprint] = parseSprintDates(trimmedSprint);
                }
            });
        }
    });

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
        var itemSprints = (item.sprint && typeof item.sprint === 'string') ? item.sprint.split(',').map(function(s) { return s.trim(); }) : [];
  var status = (item.Status || '').toLowerCase();
  var stageVal = String(item['Project Stage'] || item['ProjectStage'] || '').toLowerCase();
  var isItemClosed = stageClosedSet[stageVal] || closedStatuses.some(function(closedStatus) { return status.indexOf(closedStatus) !== -1; });

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
        var isInPastSprint = itemSprints.some(function(sprint) {
            var sprintInfo = sprints[sprint];
            return sprintInfo && sprintInfo.end && sprintInfo.end < today;
        });

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