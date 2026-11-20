/**
 * @file SprintUtilities.js
 * @description Sprint parsing and formatting utilities for project management.
 */

// --- SPRINT LOGIC HELPER ---

/**
 * Parses individual sprint entries from a sprint field value.
 * Handles:
 *   - Jira verbose format: com.atlassian.greenhopper...Sprint@hash[id=N,state=ACTIVE,name=Sprint N,startDate=ISO,endDate=ISO,...]
 *   - Simple names: "Sprint 93, Sprint 110"
 *   - Legacy date format: "Sprint 93 M.DD - M.DD"
 * @param {string} sprintString
 * @returns {Array<{name:string, state:string, startDate:Date|null, endDate:Date|null}>}
 */
function parseSprintEntries_(sprintString) {
  var entries = [];
  if (!sprintString || typeof sprintString !== 'string') return entries;
  var s = sprintString.trim();

  // --- Jira verbose format detection ---
  var isJiraVerbose = s.indexOf('com.atlassian') !== -1 ||
                      (s.indexOf('state=') !== -1 && s.indexOf('[id=') !== -1);

  if (isJiraVerbose) {
    // Split on sprint object boundaries (each sprint starts with com.atlassian or appears after ],)
    var parts = s.split(/,?\s*(?=com\.atlassian)/);
    parts.forEach(function(part) {
      if (!part) return;
      // Extract name= field (e.g. name=Sprint 110)
      var nameMatch = part.match(/[,\[]name=([^,\]]+)/);
      var name = nameMatch ? nameMatch[1].trim() : '';
      // Fall back to first "Sprint N" in the block
      if (!name) {
        var sprintMatch = part.match(/Sprint\s*\d+/i);
        name = sprintMatch ? sprintMatch[0].trim() : '';
      }
      if (!name) return;

      // Extract state= field
      var stateMatch = part.match(/[,\[]state=([^,\]]+)/);
      var state = stateMatch ? stateMatch[1].trim().toUpperCase() : '';

      // Extract ISO dates (startDate=YYYY-MM-DD, endDate=YYYY-MM-DD)
      var startIso = part.match(/startDate=(\d{4}-\d{2}-\d{2})/);
      var endIso   = part.match(/endDate=(\d{4}-\d{2}-\d{2})/);
      var startDate = startIso ? new Date(startIso[1] + 'T00:00:00') : null;
      var endDate   = endIso   ? new Date(endIso[1]   + 'T23:59:59') : null;

      entries.push({ name: name, state: state, startDate: startDate, endDate: endDate });
    });

    if (entries.length > 0) return entries;
  }

  // --- Simple "Sprint N" comma-separated names ---
  var simpleMatches = s.match(/Sprint\s*\d+/ig);
  if (simpleMatches) {
    simpleMatches.forEach(function(name) {
      entries.push({ name: name.trim(), state: '', startDate: null, endDate: null });
    });
    return entries;
  }

  // --- Legacy M.DD - M.DD date range format ---
  var dateMatch = s.match(/(\d{1,2})\.(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})/);
  if (dateMatch) {
    var sm = parseInt(dateMatch[1], 10), sd = parseInt(dateMatch[2], 10);
    var em = parseInt(dateMatch[3], 10), ed = parseInt(dateMatch[4], 10);
    var year = new Date().getFullYear();
    var sprintNameM = s.match(/Sprint\s*\d+/i);
    var mName = sprintNameM ? sprintNameM[0].trim() : s.trim();
    // Only use dates if months are valid (1-12); otherwise just store the name
    if (sm >= 1 && sm <= 12 && em >= 1 && em <= 12) {
      var startDate2 = new Date(year, sm - 1, sd);
      var endDate2   = new Date(year, em - 1, ed);
      if (startDate2 > endDate2) endDate2.setFullYear(year + 1);
      endDate2.setHours(23, 59, 59, 999);
      entries.push({ name: mName, state: '', startDate: startDate2, endDate: endDate2 });
    } else if (mName) {
      entries.push({ name: mName, state: '', startDate: null, endDate: null });
    }
    return entries;
  }

  // --- Last resort: whole string as name ---
  if (s) entries.push({ name: s, state: '', startDate: null, endDate: null });
  return entries;
}

function formatSprint(sprintString) {
  if (!sprintString || typeof sprintString !== 'string') return '—';
  var match = sprintString.match(/(Sprint\s?\d+)/i);
  return match ? match[1].trim() : '—';
}

/**
 * Analyzes project data to generate sprint statistics.
 * @param {Array<Object>} items - Combined list of projects and independent tasks
 * @returns {Object} Sprint statistics map
 */
function analyzeSprintData(items) {
  var stats = {
    currentSprintName: 'None',
    currentSprintStart: null,
    currentSprintEnd: null
  };
  var now = new Date();
  var activeSprint = null;       // best candidate found via state/date
  var highestSprintNumber = -1;  // fallback: highest sprint number seen
  var highestSprintEntry = null;

  items.forEach(function(item) {
    var sprint = item.sprint || item.Sprint;
    if (!sprint) return;

    // Parse ALL individual sprint entries from this field value
    var entries = parseSprintEntries_(sprint);

    entries.forEach(function(entry) {
      // Normalise sprint name (e.g. "Sprint 110")
      var sprintName = formatSprint(entry.name);
      if (!sprintName || sprintName === '—') sprintName = entry.name;
      if (!sprintName) return;

      // Track highest sprint number for fallback
      var numMatch = sprintName.match(/Sprint\s*(\d+)/i);
      if (numMatch) {
        var num = parseInt(numMatch[1], 10);
        if (num > highestSprintNumber) {
          highestSprintNumber = num;
          highestSprintEntry = entry;
          highestSprintEntry.name = sprintName;
        }
      }

      // Create stats entry if not yet seen
      if (!stats[sprintName]) {
        var isActive = false;

        // 1. Trust explicit Jira state flag first
        if (entry.state === 'ACTIVE') {
          isActive = true;
        } else if (entry.state === 'CLOSED' || entry.state === 'COMPLETE' || entry.state === 'COMPLETED') {
          isActive = false;
        } else if (entry.startDate && entry.endDate) {
          // 2. Fall back to date range check
          isActive = now >= entry.startDate && now <= entry.endDate;
        }

        stats[sprintName] = {
          name: sprintName,
          state: entry.state,
          startDate: entry.startDate,
          endDate: entry.endDate,
          isActive: isActive,
          totalItems: 0,
          completedItems: 0,
          totalPoints: 0,
          completedPoints: 0
        };

        // Track best active sprint:
        // Priority 1 – explicit ACTIVE state; Priority 2 – latest end date
        if (isActive) {
          if (!activeSprint) {
            activeSprint = stats[sprintName];
          } else if (entry.state === 'ACTIVE' && activeSprint.state !== 'ACTIVE') {
            activeSprint = stats[sprintName]; // explicit flag beats date inference
          } else if (
            entry.state === activeSprint.state &&
            entry.endDate && activeSprint.endDate &&
            entry.endDate > activeSprint.endDate
          ) {
            activeSprint = stats[sprintName]; // same priority – prefer later end date
          }
        }
      }

      var s = stats[sprintName];
      s.totalItems++;

      var points = parseFloat(item['Story Points'] || item.storyPoints || 0);
      if (!isNaN(points)) s.totalPoints += points;

      var status = (item.Status || item.status || '').toLowerCase();
      var stage  = (item['Project Stage'] || item.projectStage || '').toLowerCase();
      var isClosed =
          status === 'done'   || status === 'closed'   ||
          status === 'resolved' || status === 'fixed'  ||
          stage  === 'production' || stage === 'in production' || stage === 'canceled';

      if (isClosed) {
        s.completedItems++;
        if (!isNaN(points)) s.completedPoints += points;
      }
    });
  });

  // If no sprint was identified as active via state/dates, fall back to
  // the highest-numbered sprint (most recent in Jira numbering).
  if (!activeSprint && highestSprintEntry) {
    var fallbackName = highestSprintEntry.name;
    if (!stats[fallbackName]) {
      stats[fallbackName] = {
        name: fallbackName,
        state: '',
        startDate: highestSprintEntry.startDate,
        endDate: highestSprintEntry.endDate,
        isActive: true,
        totalItems: 0,
        completedItems: 0,
        totalPoints: 0,
        completedPoints: 0
      };
    }
    activeSprint = stats[fallbackName];
  }

  if (activeSprint) {
    stats.currentSprintName  = activeSprint.name || 'None';
    stats.currentSprintStart = activeSprint.startDate ? activeSprint.startDate.toISOString() : null;
    stats.currentSprintEnd   = activeSprint.endDate   ? activeSprint.endDate.toISOString()   : null;
  }

  return stats;
}

function analyzeSprintCapacity(items, currentSprintName, capacityEntries) {
  var sprintName = String(currentSprintName || '').trim();
  var capacityByDeveloper = new Map();
  var totalIssues = 0;
  var totalStoryPoints = 0;
  var hasSprint = Boolean(sprintName && sprintName !== 'None' && sprintName !== '—');

  // Configured capacity per developer (from the DeveloperCapacity sheet), keyed case-insensitively.
  var configuredCapacity = new Map();
  (capacityEntries || []).forEach(function(config) {
    if (!config || !config.developer) return;
    var name = String(config.developer).trim();
    if (!name) return;
    var points = config.capacity;
    configuredCapacity.set(name.toLowerCase(), {
      developer: name,
      capacity: typeof points === 'number' && Number.isFinite(points) && points >= 0 ? points : null
    });
  });

  (items || []).forEach(function(item) {
    var developer = String(item.Assignee || item.assignee || item['Assigned Dev'] || '').trim();
    if (developer && developer.toLowerCase() !== 'unassigned' && !capacityByDeveloper.has(developer.toLowerCase())) {
      capacityByDeveloper.set(developer.toLowerCase(), { developer: developer, issueCount: 0, storyPoints: 0 });
    }
    if (!hasSprint) return;
    if (String(item['Issue Type'] || '').trim().toLowerCase() === 'epic') return;

    var sprintEntries = parseSprintEntries_(item.sprint || item.Sprint);
    var belongsToCurrentSprint = sprintEntries.some(function(entry) {
      var entryName = formatSprint(entry.name);
      return (entryName === '—' ? entry.name : entryName).toLowerCase() === sprintName.toLowerCase();
    });
    if (!belongsToCurrentSprint) return;

    developer = developer && developer.toLowerCase() !== 'unassigned' ? developer : 'Unassigned';
    var pointsValue = item['Story Points'] !== undefined ? item['Story Points'] : item.storyPoints;
    var points = parseFloat(String(pointsValue == null ? '' : pointsValue).trim());
    if (!Number.isFinite(points)) points = 0;

    var key = developer.toLowerCase();
    var entry = capacityByDeveloper.get(key);
    if (!entry) {
      entry = { developer: developer, issueCount: 0, storyPoints: 0 };
      capacityByDeveloper.set(key, entry);
    }
    entry.issueCount++;
    entry.storyPoints += points;
    totalIssues++;
    totalStoryPoints += points;
  });

  var developers = Array.from(capacityByDeveloper.values()).map(function(entry) {
    var config = entry.developer === 'Unassigned' ? null : configuredCapacity.get(entry.developer.toLowerCase());
    var capacity = config && config.capacity != null ? config.capacity : null;
    entry.capacity = capacity;
    entry.remaining = capacity == null || !hasSprint ? null : capacity - entry.storyPoints;
    return entry;
  }).sort(function(a, b) {
    return b.storyPoints - a.storyPoints || a.developer.localeCompare(b.developer);
  });

  return {
    sprintName: hasSprint ? sprintName : 'None',
    totalIssues: totalIssues,
    totalStoryPoints: totalStoryPoints,
    developers: developers
  };
}

function analyzeSprintCapacityPlan(projects, sprintItems, sprintStats, capacityEntries) {
  var now = new Date();
  var sprints = new Map();
  (sprintItems || []).forEach(function(item) {
    parseSprintEntries_(item.sprint || item.Sprint).forEach(function(entry) {
      var name = formatSprint(entry.name);
      if (name === '—') name = entry.name;
      if (!name) return;
      var key = name.toLowerCase();
      var sprint = sprints.get(key);
      if (!sprint) {
        sprint = { name: name, states: new Set(), startDate: null };
        sprints.set(key, sprint);
      }
      if (entry.state) sprint.states.add(entry.state);
      if (entry.startDate && (!sprint.startDate || entry.startDate < sprint.startDate)) {
        sprint.startDate = entry.startDate;
      }
    });
  });

  var currentName = String(sprintStats.currentSprintName || 'None');
  var current = sprints.get(currentName.toLowerCase());
  var isClosed = function(sprint) {
    return sprint.states.has('CLOSED') || sprint.states.has('COMPLETE') || sprint.states.has('COMPLETED');
  };
  if (current && !current.states.has('ACTIVE') && !isClosed(current) &&
      (current.states.has('FUTURE') || (current.startDate && current.startDate > now))) {
    currentName = 'None';
  }
  var currentNumber = currentName.match(/^Sprint\s*(\d+)$/i);
  var future = Array.from(sprints.values()).filter(function(sprint) {
    if (sprint.name.toLowerCase() === currentName.toLowerCase() ||
        sprint.states.has('ACTIVE') || isClosed(sprint)) return false;
    if (sprint.states.has('FUTURE')) return true;
    if (sprint.startDate) return sprint.startDate > now;
    var number = sprint.name.match(/^Sprint\s*(\d+)$/i);
    return Boolean(currentNumber && number && Number(number[1]) > Number(currentNumber[1]));
  }).sort(function(a, b) {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return {
    current: analyzeSprintCapacity(projects, currentName, capacityEntries),
    future: future.map(function(sprint) {
      return analyzeSprintCapacity(projects, sprint.name, capacityEntries);
    })
  };
}
